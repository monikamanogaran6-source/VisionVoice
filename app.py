from flask import Flask, render_template, request, jsonify, redirect,session
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from flask import session

import os
import traceback

from dotenv import load_dotenv
from google import genai
from google.genai import types


# ==========================================
# FLASK APP
# ==========================================

app = Flask(__name__)

# ==========================================
# USER DATABASE
# ==========================================

app.secret_key = "visionvoice_secret_key"


def init_database():

    conn = sqlite3.connect("visionvoice.db")

    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


init_database()


# ==========================================
# LOAD GEMINI API KEY
# ==========================================

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

print("API KEY LOADED:", bool(api_key))

client = genai.Client(
    api_key=api_key
)


# ==========================================
# MODEL NAME
# ==========================================
# Google is redirecting free-tier/new accounts to gemini-3.5-flash-lite.
# This is a "lite" model so free-tier daily quota should be higher
# than gemini-3.6-flash.

GEMINI_MODEL = "gemini-3.5-flash-lite"


# ==========================================
# UPLOAD FOLDER
# ==========================================

UPLOAD_FOLDER = "uploads"

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)


# ==========================================
# STORE CURRENT PRODUCT IMAGE
# ==========================================

current_image_path = None

# ==========================================
# MODULE 10 - ADMIN DASHBOARD DATA
# ==========================================

admin_stats = {
    "total_users": 0,
    "products_scanned": 0,
    "ocr_requests": 0,
    "recommendation_requests": 0,
    "voice_requests": 0
}

# ==========================================
# SHOPPING LIST
# ==========================================

shopping_list = []


# ==========================================
# ADD PRODUCT TO SHOPPING LIST
# ==========================================

@app.route("/shopping/add", methods=["POST"])
def add_to_shopping_list():

    data = request.get_json()

    product = data.get("product", "").strip()

    if not product:
        return jsonify({
            "answer": "I could not find the product name."
        })

    if product not in shopping_list:
        shopping_list.append(product)

    return jsonify({
        "answer": product + " has been added to your shopping list.",
        "shopping_list": shopping_list
    })


# ==========================================
# GET SHOPPING LIST
# ==========================================

@app.route("/shopping/list", methods=["GET"])
def get_shopping_list():

    if not shopping_list:

        return jsonify({
            "answer": "Your shopping list is empty.",
            "shopping_list": []
        })

    items = ", ".join(shopping_list)

    return jsonify({
        "answer": "Your shopping list contains: " + items,
        "shopping_list": shopping_list
    })


# ==========================================
# CLEAR SHOPPING LIST
# ==========================================

@app.route("/shopping/clear", methods=["POST"])
def clear_shopping_list():

    shopping_list.clear()

    return jsonify({
        "answer": "Your shopping list has been cleared.",
        "shopping_list": []
    })

# ==========================================
# HOME PAGE
# ==========================================

@app.route("/")
def home():

    if "user_id" not in session:
        return redirect("/login")

    user_name = session.get("user_name")

    return render_template(
        "index.html",
        result=None,
        selected_language="en",
        user_name=user_name
    )

# ==========================================
# USER LOGOUT
# ==========================================

@app.route("/logout")
def logout():

    session.clear()

    return redirect("/login")


# ==========================================
# USER REGISTRATION
# ==========================================

@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "GET":
        return render_template("register.html")


    name = request.form.get("name", "").strip()
    email = request.form.get("email", "").strip()
    password = request.form.get("password", "")


    # Check empty fields
    if not name or not email or not password:

        return render_template(
            "register.html",
            message="Please fill all fields."
        )


    # Connect to database
    conn = sqlite3.connect("visionvoice.db")

    cursor = conn.cursor()


    # Check whether email already exists
    cursor.execute(
        "SELECT id FROM users WHERE email = ?",
        (email,)
    )

    existing_user = cursor.fetchone()


    if existing_user:

        conn.close()

        return render_template(
            "register.html",
            message="Email already registered."
        )


    # Hash password
    hashed_password = generate_password_hash(password)


    # Save user
    cursor.execute(
        """
        INSERT INTO users (name, email, password)
        VALUES (?, ?, ?)
        """,
        (name, email, hashed_password)
    )


    conn.commit()
    conn.close()


    return render_template(
        "register.html",
        message="Registration successful! You can now login."
    )

# ==========================================
# USER LOGIN
# ==========================================

@app.route("/login", methods=["GET", "POST"])
def login():

    if request.method == "GET":
        return render_template("login.html")


    email = request.form.get("email", "").strip()
    password = request.form.get("password", "")


    # Check empty fields
    if not email or not password:

        return render_template(
            "login.html",
            message="Please enter email and password."
        )


    # Connect to database
    conn = sqlite3.connect("visionvoice.db")

    cursor = conn.cursor()


    # Find user
    cursor.execute(
        "SELECT id, name, password FROM users WHERE email = ?",
        (email,)
    )

    user = cursor.fetchone()

    conn.close()


    # Check user and password
    if user and check_password_hash(user[2], password):

        session["user_id"] = user[0]
        session["user_name"] = user[1]
        session["user_email"] = email


        return redirect("/")

    return render_template(
        "login.html",
        message="Invalid email or password."
    )


# ==========================================
# PRODUCT SCAN
# ==========================================

@app.route("/predict", methods=["POST"])
def predict():

    global current_image_path

    # -------------------------------
    # Check image
    # -------------------------------

    if "image" not in request.files:

        return render_template(
            "index.html",
            result="No image uploaded.",
            selected_language="en"
        )


    image = request.files["image"]


    if image.filename == "":

        return render_template(
            "index.html",
            result="Please select an image.",
            selected_language="en"
        )


    # -------------------------------
    # Selected language
    # -------------------------------

    selected_language = request.form.get(
        "language",
        "en"
    )


    language_names = {

        "en": "English",

        "ta": "Tamil",

        "hi": "Hindi"

    }


    language_name = language_names.get(
        selected_language,
        "English"
    )


    # -------------------------------
    # Save image
    # -------------------------------

    image_path = os.path.join(
        app.config["UPLOAD_FOLDER"],
        image.filename
    )

    image.save(image_path)

    current_image_path = image_path

    admin_stats["products_scanned"] += 1

    try:

        # -------------------------------
        # Read image
        # -------------------------------

        with open(image_path, "rb") as img_file:

            image_bytes = img_file.read()


        # -------------------------------
        # Image type
        # -------------------------------

        mime_type = image.mimetype

        if not mime_type:

            mime_type = "image/jpeg"


        # -------------------------------
        # Gemini image
        # -------------------------------

        image_part = types.Part.from_bytes(

            data=image_bytes,

            mime_type=mime_type

        )


        # -------------------------------
        # Product analysis
        # -------------------------------

        prompt = f"""
Analyze this product image carefully.

The user selected the language: {language_name}.

Identify the product and explain all useful information that is
actually visible in the image.

Do NOT use only a fixed list of fields.

The information should depend on the product.

For example:

Clothing:
name, brand, color, size, material, pattern, etc.

Food:
name, brand, quantity, ingredients, manufacturing date,
expiry or best-before date, price, etc.

Cosmetics:
name, brand, shade, quantity, ingredients, expiry date, etc.

Electronics:
name, brand, model, color, capacity, specifications, etc.

Medicine:
name, brand, strength, manufacturer, expiry date, etc.

For any other product, provide all useful visible information.

Also read visible text from the package or label.

IMPORTANT:

- Do not invent information.
- Do not guess missing information.
- Only provide information that is visible or clearly identifiable.
- If something important cannot be seen, say "Not visible".
- Keep the explanation simple.
- Make it easy for a visually impaired user to understand.
- Answer completely in {language_name}.
"""


        # -------------------------------
        # Gemini
        # -------------------------------

        response = client.models.generate_content(

            model=GEMINI_MODEL,

            contents=[
                image_part,
                prompt
            ]

        )


        result = response.text


    except Exception as e:

        # Print full traceback in terminal so we can see the REAL error
        print("PREDICT ERROR:")
        traceback.print_exc()

        result = "AI analysis failed: " + str(e)


    # -------------------------------
    # Return result
    # -------------------------------

    if request.headers.get("X-Requested-With") == "XMLHttpRequest":

        return jsonify({
            "success": True,
            "result": result,
            "language": selected_language
    })


    return render_template(

        "index.html",

        result=result,

    selected_language=selected_language

)

# ==========================================
# OCR - READ TEXT FROM PRODUCT IMAGE
# ==========================================

@app.route("/ocr", methods=["POST"])
def ocr():

    admin_stats["ocr_requests"] += 1

    global current_image_path

    data = request.get_json()

    language = data.get("language", "en")

    language_names = {
        "en": "English",
        "ta": "Tamil",
        "hi": "Hindi"
    }

    language_name = language_names.get(
        language,
        "English"
    )

    # Check image
    if not current_image_path:

        return jsonify({
            "answer": "Please scan a product image first."
        })


    try:

        # Read current image
        with open(
            current_image_path,
            "rb"
        ) as img_file:

            image_bytes = img_file.read()


        # Detect image type
        extension = os.path.splitext(
            current_image_path
        )[1].lower()

        mime_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp"
        }

        mime_type = mime_types.get(
            extension,
            "image/jpeg"
        )


        image_part = types.Part.from_bytes(
            data=image_bytes,
            mime_type=mime_type
        )


        # OCR prompt
        prompt = f"""
Read all clearly visible text from this product image.

The user wants the result in {language_name}.

Extract useful visible text such as:

- Product name
- Brand
- Ingredients
- Weight or quantity
- Price
- Manufacturing date
- Expiry date
- Batch number
- Instructions
- Warnings
- Labels
- Other clearly visible text

IMPORTANT:

1. Read only text that is actually visible.
2. Do not guess unclear text.
3. If text is not readable, say it is not clearly visible.
4. Preserve important numbers and dates accurately.
5. Give the answer in {language_name}.
6. Make it simple and easy for a visually impaired user.
"""

        response = client.models.generate_content(

            model="gemini-3.5-flash",

            contents=[
                image_part,
                prompt
            ]
        )


        answer = response.text


        return jsonify({
            "answer": answer
        })


    except Exception as e:

        print("OCR ERROR:", e)

        return jsonify({
            "answer":
            "Sorry, I could not read the text from this image."
        })

# ==========================================
# MODULE 9 - PRODUCT RECOMMENDATION
# ==========================================

@app.route("/recommend", methods=["POST"])
def recommend():

    admin_stats["recommendation_requests"] += 1

    global current_image_path

    data = request.get_json()

    language = data.get("language", "en")

    language_names = {
        "en": "English",
        "ta": "Tamil",
        "hi": "Hindi"
    }

    language_name = language_names.get(
        language,
        "English"
    )

    # Check product image
    if not current_image_path:

        return jsonify({
            "answer": "Please scan a product first."
        })


    try:

        # Read current product image
        with open(
            current_image_path,
            "rb"
        ) as img_file:

            image_bytes = img_file.read()


        # Image type
        extension = os.path.splitext(
            current_image_path
        )[1].lower()

        mime_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp"
        }

        mime_type = mime_types.get(
            extension,
            "image/jpeg"
        )


        image_part = types.Part.from_bytes(
            data=image_bytes,
            mime_type=mime_type
        )


        # Recommendation prompt
        prompt = f"""
You are VisionVoice, a friendly AI shopping assistant.

Analyze the product shown in this image and provide useful
product recommendations.

The user selected language: {language_name}.

Give recommendations based on the product category,
type, purpose, and visible characteristics.

For example:

If it is clothing:
- Similar clothing
- Matching clothing
- Useful accessories

If it is food:
- Similar food products
- Complementary food items

If it is cosmetics:
- Related skincare or beauty products

If it is electronics:
- Useful accessories or related products

If it is a household product:
- Useful complementary products

IMPORTANT:

1. Do not invent exact product prices.
2. Do not claim a product is available in a particular store.
3. Do not invent brands or specifications.
4. Give general and useful recommendations.
5. Explain why each recommendation may be useful.
6. Keep the explanation simple.
7. Answer completely in {language_name}.
8. Make the answer easy for a visually impaired user to understand.
"""

        response = client.models.generate_content(

            model="gemini-3.5-flash",

            contents=[
                image_part,
                prompt
            ]
        )


        answer = response.text


        return jsonify({
            "answer": answer
        })


    except Exception as e:

        print("RECOMMENDATION ERROR:", e)

        return jsonify({
            "answer":
            "Sorry, I could not generate recommendations right now."
        })
    
    
# ==========================================
# NATURAL CONVERSATION
# ==========================================

@app.route("/ask", methods=["POST"])
def ask():

    admin_stats["voice_requests"] += 1

    global current_image_path

    data = request.get_json()

    question = data.get(
        "question",
        ""
    )

    language = data.get(
        "language",
        "en"
    )


    if not question:

        return jsonify({

            "answer": "Please ask me something."

        })


    # -------------------------------
    # Language
    # -------------------------------

    language_names = {

        "en": "English",

        "ta": "Tamil",

        "hi": "Hindi"

    }


    language_name = language_names.get(
        language,
        "English"
    )


    # -------------------------------
    # Check product image
    # -------------------------------

    if not current_image_path:

        return jsonify({

            "answer":
            "Please scan a product image first."

        })


    try:

        # -------------------------------
        # Read current product image
        # -------------------------------

        with open(
            current_image_path,
            "rb"
        ) as img_file:

            image_bytes = img_file.read()


        # -------------------------------
        # Image type
        # -------------------------------

        extension = os.path.splitext(
            current_image_path
        )[1].lower()


        mime_types = {

            ".jpg": "image/jpeg",

            ".jpeg": "image/jpeg",

            ".png": "image/png",

            ".webp": "image/webp"

        }


        mime_type = mime_types.get(
            extension,
            "image/jpeg"
        )


        image_part = types.Part.from_bytes(

            data=image_bytes,

            mime_type=mime_type

        )


        # -------------------------------
        # Natural conversation prompt
        # -------------------------------

        conversation_prompt = f"""
You are VisionVoice, a friendly AI shopping assistant
for a visually impaired user.

The user is talking to you naturally like a friend.

The current product is shown in the image.

The user selected language: {language_name}

The user's question is:

"{question}"

Answer the user's question naturally and conversationally
in {language_name}.

IMPORTANT:

1. Understand the user's question based on the product image.
2. Give only information that is visible or reliably identifiable.
3. Never invent brand, price, expiry date, size, weight or other details.
4. If the requested information is not visible, clearly say that
   it is not visible.
5. If the user asks "tell me more", provide additional useful
   details visible in the image.
6. If the user asks about color, answer the color.
7. If the user asks about brand, answer the brand.
8. If the user asks about expiry, check the visible package text.
9. If the user asks what the product is, identify it.
10. Keep the response friendly, simple and easy to understand.
11. Do not use complicated technical language.
12. Answer completely in {language_name}.

The user expects a natural conversation, not a fixed list.
"""


        # -------------------------------
        # Gemini conversation
        # -------------------------------

        response = client.models.generate_content(

            model=GEMINI_MODEL,

            contents=[

                image_part,

                conversation_prompt

            ]

        )


        answer = response.text


        return jsonify({

            "answer": answer

        })


    except Exception as e:

        # Print full traceback in terminal so we can see the REAL error
        print("ASK ERROR:")
        traceback.print_exc()

        return jsonify({

            "answer":
            "Sorry, I could not understand the product right now."

        })

# ==========================================
# ADMIN DASHBOARD
# ==========================================

@app.route("/admin")
def admin_dashboard():

    return render_template(
        "admin.html",
        stats=admin_stats
    )


# ==========================================
# RUN APP
# ==========================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
        ssl_context="adhoc"
    )