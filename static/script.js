let currentLanguage = "en";

const languageCodes = {
    en: "en-US",
    ta: "ta-IN",
    hi: "hi-IN"
};


// ================================
// FIND VOICE
// ================================

function getVoice(languageCode) {

    const voices = window.speechSynthesis.getVoices();

    return voices.find(
        voice => voice.lang.toLowerCase() === languageCode.toLowerCase()
    ) || voices.find(
        voice => voice.lang.toLowerCase().startsWith(
            languageCode.substring(0, 2).toLowerCase()
        )
    );
}


// ================================
// SPEAK
// ================================

function speak(text) {

    if (!text) return;

    // Stop microphone while VisionVoice is speaking
    if (voiceRecognition) {
        try {
            voiceRecognition.stop();
        } catch (error) {
            console.log("Recognition already stopped.");
        }
    }

    voiceIsSpeaking = true;

    window.speechSynthesis.cancel();

    const languageCode =
        languageCodes[currentLanguage] || "en-US";

    const speech =
        new SpeechSynthesisUtterance(text);

    speech.lang = languageCode;
    speech.rate = 0.9;
    speech.pitch = 1;

    const voice = getVoice(languageCode);

    if (voice) {
        speech.voice = voice;
    }

    speech.onend = function () {

        voiceIsSpeaking = false;

        // Start listening again after VisionVoice finishes speaking
        if (voiceModeActive) {

            setTimeout(function () {

                if (voiceModeActive) {
                    startVoiceCommand();
                }

            }, 500);
        }
    };

    window.speechSynthesis.speak(speech);
}


// ================================
// LISTEN TO PRODUCT DETAILS
// ================================

function speakText() {

    const details =
        document.querySelector(".details");

    if (!details) {

        speak("Please scan a product first.");

        return;
    }

    speak(details.innerText);
}


// ================================
// STOP
// ================================

function stopVoice() {

    window.speechSynthesis.cancel();

}


// ================================
// CHANGE LANGUAGE
// ================================

function changeLanguage(language) {

    currentLanguage = language;

    const select =
        document.getElementById("language");

    if (select) {
        select.value = language;
    }

    const names = {
        en: "English",
        ta: "Tamil",
        hi: "Hindi"
    };

    speak(
        "Okay. I will speak in " +
        names[language] +
        " from now."
    );
}

// ==========================================
// OCR TEXT READING
// ==========================================

async function readImageText() {

    const status =
        document.getElementById("voiceStatus");

    status.innerText =
        "🔍 Reading text from the product...";


    try {

        const response = await fetch("/ocr", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                language: currentLanguage

            })

        });


        const data = await response.json();


        if (data.answer) {

            status.innerText =
                "📝 " + data.answer;

            speak(data.answer);

        }

    } catch (error) {

        console.error(error);

        status.innerText =
            "Could not read the product text.";

    }
}

// ==========================================
// PRODUCT RECOMMENDATION
// ==========================================

async function getRecommendations() {

    const status =
        document.getElementById("voiceStatus");

    status.innerText =
        "💡 Finding useful recommendations...";


    try {

        const response = await fetch(
            "/recommend",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    language: currentLanguage
                })
            }
        );


        const data =
            await response.json();


        if (data.answer) {

            status.innerText =
                "💡 " + data.answer;

            speak(data.answer);


            // Show in conversation box
            const conversation =
                document.getElementById(
                    "conversation"
                );

            if (conversation) {

                conversation.innerHTML +=
                    `<p>
                        <strong>🤖 Recommendation:</strong>
                        ${data.answer}
                    </p>`;

                conversation.scrollTop =
                    conversation.scrollHeight;
            }

        }

    } catch (error) {

        console.error(error);

        status.innerText =
            "Could not generate recommendations.";

    }
}


// ==========================================
// ADD TO SHOPPING LIST
// ==========================================

async function addToShoppingList() {

    const details = document.querySelector(".details");

    if (!details) {
        speak("Please scan a product first.");
        return;
    }

    const text = details.innerText;

    // Ask Gemini for product name
    const response = await fetch("/ask", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            question: "What is the product name? Give only the product name.",
            language: "en"
        })
    });

    const data = await response.json();

    const productName = data.answer.trim();


    // Add product
    const addResponse = await fetch("/shopping/add", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            product: productName
        })
    });


    const result = await addResponse.json();

    speak(result.answer);

    document.getElementById("voiceStatus").innerText =
        "🛒 " + result.answer;
}


// ==========================================
// SHOW SHOPPING LIST
// ==========================================

async function showShoppingList() {

    try {

        const response =
            await fetch("/shopping/list");

        const data =
            await response.json();

        const status =
            document.getElementById("voiceStatus");

        const shoppingItems =
            document.getElementById("shoppingItems");


        // Voice status
        if (status) {

            status.innerText =
                "🛒 " + data.answer;

        }


        // Display shopping list on webpage
        if (shoppingItems) {

            shoppingItems.innerHTML =
                "<p>🛒 " + data.answer + "</p>";

        }


        // Speak shopping list
        speak(data.answer);


    } catch (error) {

        console.error(
            "Shopping list error:",
            error
        );

        const shoppingItems =
            document.getElementById("shoppingItems");

        if (shoppingItems) {

            shoppingItems.innerHTML =
                "<p>❌ Could not load shopping list.</p>";

        }

        speak(
            "Sorry, I could not load your shopping list."
        );

    }
}


// ==========================================
// CLEAR SHOPPING LIST
// ==========================================

async function clearShoppingList() {

    const response =
        await fetch("/shopping/clear", {

            method: "POST"

        });

    const data =
        await response.json();

    document.getElementById("voiceStatus").innerText =
        "🛒 " + data.answer;

    speak(data.answer);
}

// ==========================================
// VOICE NAVIGATION
// ==========================================

function handleVoiceNavigation(command) {

    const lower = command.toLowerCase();

    // Shopping List
    if (
        lower.includes("go to shopping list") ||
        lower.includes("open shopping list") ||
        lower.includes("show shopping list")
    ) {
        const section =
            document.getElementById("shoppingSection");

        if (section) {
            section.scrollIntoView({
                behavior: "smooth"
            });
        }

        speak("Opening your shopping list.");

        return true;
    }


    // Conversation
    if (
        lower.includes("go to conversation") ||
        lower.includes("open conversation") ||
        lower.includes("talk to visionvoice")
    ) {
        const conversation =
            document.querySelector(".conversation-box");

        if (conversation) {
            conversation.scrollIntoView({
                behavior: "smooth"
            });
        }

        speak("Opening our conversation.");

        return true;
    }


    // Product details
    if (
        lower.includes("go to product details") ||
        lower.includes("show product details") ||
        lower.includes("read product")
    ) {
        const details =
            document.querySelector(".details");

        if (details) {
            details.scrollIntoView({
                behavior: "smooth"
            });

            speakText();
        } else {
            speak("Please scan a product first.");
        }

        return true;
    }


    // Home
    if (
        lower === "go home" ||
        lower.includes("go to home") ||
        lower.includes("scroll to top")
    ) {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        speak("Going to the home section.");

        return true;
    }


    return false;
}


// ================================
// ASK GEMINI NATURAL QUESTION
// ================================

async function askGemini(question) {

    const status =
        document.getElementById("voiceStatus");

    const conversation =
        document.getElementById("conversation");


    // Show user question
    conversation.innerHTML +=
        `<p>
            <strong>You:</strong>
            ${question}
        </p>`;


    status.innerText =
        "🤖 VisionVoice is thinking...";


    try {

        const response = await fetch("/ask", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                question: question,

                language: currentLanguage

            })

        });


        const data = await response.json();


        if (data.answer) {

            // Show AI answer
            conversation.innerHTML +=
                `<p>
                    <strong>🤖 VisionVoice:</strong>
                    ${data.answer}
                </p>`;


            status.innerText =
                "Answer ready";


            // Speak answer
            speak(data.answer);


            // Scroll conversation
            conversation.scrollTop =
                conversation.scrollHeight;

        }

    } catch (error) {

        console.error(error);

        conversation.innerHTML +=
            `<p>
                <strong>VisionVoice:</strong>
                Sorry, I couldn't answer right now.
            </p>`;

        status.innerText =
            "Connection error.";

    }
}

let voiceRecognition = null;
let voiceModeActive = false;
let voiceIsSpeaking = false;

document.addEventListener("DOMContentLoaded", function () {

    setTimeout(function () {

        if (!voiceModeActive) {
            startVisionVoiceAutomatically();
        }

    }, 1000);

});

async function startVisionVoiceAutomatically() {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    const status =
        document.getElementById("voiceStatus");

    if (!SpeechRecognition) {

        status.innerText =
            "❌ Voice recognition is not supported in this browser.";

        return;
    }

    status.innerText =
        "🔊 Welcome to VisionVoice. Please allow microphone access.";

    speak(
        "Welcome to VisionVoice. Please allow microphone access."
    );

    // Give the welcome message time to finish
    // before requesting microphone access.
    setTimeout(async function () {

        try {

            const stream =
                await navigator.mediaDevices.getUserMedia({
                    audio: true
                });

            // Microphone permission granted.
            // Stop this temporary microphone stream.
            stream.getTracks().forEach(function (track) {
                track.stop();
            });

            voiceModeActive = true;

            const button =
                document.getElementById("startVoiceButton");

            button.innerText =
                "🟢 VisionVoice Active";

            status.innerText =
                "🟢 Microphone access granted. VisionVoice is listening.";

            speak(
                "Microphone access granted. VisionVoice is now listening."
            );

        } catch (error) {

            console.error(
                "Microphone permission error:",
                error
            );

            status.innerText =
                "🎤 Please allow microphone access to use VisionVoice.";

        }

    }, 3000);
}

function activateVisionVoice() {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    const status =
        document.getElementById("voiceStatus");

    const button =
        document.getElementById("startVoiceButton");

    if (!SpeechRecognition) {

        status.innerText =
            "❌ Voice recognition is not supported in this browser.";

        return;
    }

    if (voiceModeActive) {
        return;
    }

    voiceModeActive = true;

    button.innerText =
        "🟢 VisionVoice Active";

    status.innerText =
        "🔊 VisionVoice is ready. Speak your command.";

    speak(
        "VisionVoice is ready. Speak your command."
    );
}

// ================================
// VOICE COMMAND
// ================================

function startVoiceCommand() {

    if (!voiceModeActive) {
        return;
    }

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;


    const status =
        document.getElementById("voiceStatus");


    if (!SpeechRecognition) {

        status.innerText =
            "Voice recognition is not supported.";

        return;
    }


    voiceRecognition =
    new SpeechRecognition();

    const recognition =
        voiceRecognition;

    recognition.continuous = false;

    recognition.interimResults = false;

    recognition.lang = "en-US";


    status.innerText =
        "🎤 Listening... Speak now";


    recognition.start();


    recognition.onresult =
        async function(event) {

            const question =
                event.results[0][0].transcript.trim();


            status.innerText =
                "👤 You: " + question;


            console.log(
                "User said:",
                question
            );


            const lower =
                question.toLowerCase();

            // Check voice navigation first
            if (handleVoiceNavigation(question)) {
                return;
            }

            // ==========================================
            // CAMERA SCAN COMMAND
            // ==========================================

            if (
                lower.includes("scan product") ||
                lower.includes("scan the product") ||
                lower.includes("scan this product") ||
                lower.includes("scan another product") ||
                lower.includes("scan a product") ||
                lower.includes("open camera") ||
                lower.includes("start camera") ||
                lower.includes("take a product photo")
            ) {

                status.innerText =
                    "📷 Opening camera...";

                // Stop microphone while camera is being opened
                if (voiceRecognition) {
                    try {
                        voiceRecognition.stop();
                    } catch (error) {
                        console.log("Voice recognition already stopped.");
                    }
                }

                await startCamera();

                    return;
            }


            // ==========================================
            // CAMERA CAPTURE VOICE COMMAND
            // ==========================================

            if (
                lower.includes("capture product") ||
                lower.includes("capture the product") ||
                lower.includes("take the picture") ||
                lower.includes("take a picture") ||
                lower.includes("capture image")
            ) {

                status.innerText =
                    "📸 Capturing product...";

                captureProduct();

                return;
            }

            // ==========================================
            // PRODUCT RECOMMENDATION COMMAND
            // ==========================================

            if (
                lower.includes("recommend") ||
                lower.includes("recommendation") ||
                lower.includes("what do you recommend") ||
                lower.includes("suggest something") ||
                lower.includes("what else should i buy")
            ) {

                await getRecommendations();

                return;
            }

            // ============================
            // LANGUAGE
            // ============================

            if (
                lower.includes("tamil")
            ) {

                changeLanguage("ta");

                return;
            }


            if (
                lower.includes("hindi")
            ) {

                changeLanguage("hi");

                return;
            }


            if (
                lower.includes("english")
            ) {

                changeLanguage("en");

                return;
            }


            // ============================
            // STOP
            // ============================

            if (
                lower === "stop" ||
                lower.includes("stop speaking")
            ) {

                stopVoice();

                status.innerText =
                    "⏹ Speech stopped.";

                return;
            }
            
            // ==========================================
            // OCR / READ TEXT
            // ==========================================

            if (
                lower.includes("read the text") ||
                lower.includes("read text") ||
                lower.includes("read the label") ||
                lower.includes("read label") ||
                lower.includes("what does the label say") ||
                lower.includes("read what's written") ||
                lower.includes("read what is written")
            ) {

                await readImageText();

                return;
            }

            // ==========================================
            // SHOPPING LIST COMMANDS
            // ==========================================

            if (
                lower.includes("add this to my shopping list") ||
                lower.includes("add this product") ||
                lower.includes("add to shopping list")
            ) {

                await addToShoppingList();

                    return;
            }


            if (
                lower.includes("show my shopping list") ||
                lower.includes("what is in my shopping list") ||
                lower.includes("shopping list")
            ) {

                await showShoppingList();

                    return;
            }


            if (
                lower.includes("clear my shopping list") ||
                lower.includes("empty my shopping list")
            ) {

                await clearShoppingList();

                    return;
            }

            // ============================
            // NORMAL CONVERSATION
            // ============================

            await askGemini(question);

        };

    recognition.onerror =
    function(event) {

        console.log(
            "Voice recognition error:",
            event.error
        );

        if (
            event.error === "not-allowed" ||
            event.error === "service-not-allowed"
        ) {
            voiceModeActive = false;

            status.innerText =
                "❌ Microphone permission denied.";

            return;
        }

        // Don't show temporary errors to the user
        // onend will restart recognition.
    };

    recognition.onend =
    function() {

        console.log("Voice recognition ended.");

        // If VisionVoice is speaking, DON'T restart microphone
        if (voiceIsSpeaking) {
            return;
        }

        // Otherwise, restart listening
        if (voiceModeActive) {

            setTimeout(function() {

                if (voiceModeActive &&
                    !voiceIsSpeaking) {

                    startVoiceCommand();
                }

            }, 500);
        }
    };
}

// ==========================================
// CAMERA PRODUCT SCANNER
// ==========================================

let cameraStream = null;

// ==========================================
// PRODUCT DETECTION MODEL
// ==========================================

let detectionModel = null;

async function loadDetectionModel() {

    try {

        console.log("Loading product detection model...");

        detectionModel = await cocoSsd.load();

        console.log("Product detection model loaded.");

    } catch (error) {

        console.error(
            "Detection model failed to load:",
            error
        );

    }
}


window.addEventListener("load", function () {

    loadDetectionModel();

});


// OPEN CAMERA
async function startCamera() {

    const video = document.getElementById("cameraPreview");
    const startButton = document.getElementById("startCameraBtn");
    const captureButton = document.getElementById("captureBtn");
    const status = document.getElementById("cameraStatus");

    try {

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: {
                    ideal: "environment"
                }
            },
            audio: false
        });

        video.srcObject = cameraStream;

        video.style.display = "block";

        startButton.style.display = "none";

        captureButton.style.display = "none";

        status.innerText =
            "📷 Camera is ready. Point the camera at the product.";

        speak(
            "Camera is ready. Point the camera at the product. I will capture it automatically in five seconds."
        );


        // Automatic hands-free capture
        setTimeout(function () {

        if (cameraStream) {

            speak("Capturing product now.");

            captureProduct();

        }

    }, 5000);   
    } catch (error) {

        console.error(error);

        status.innerText =
            "❌ Camera access was denied or unavailable.";

        speak(
            "I could not access the camera. Please allow camera permission."
        );
    }
}

// ==========================================
// REAL-TIME PRODUCT DETECTION
// ==========================================

async function detectProduct() {

    const video =
        document.getElementById("cameraPreview");

    const status =
        document.getElementById("cameraStatus");

    if (!detectionModel) {

        status.innerText =
            "🤖 Detection model is still loading...";

        return;
    }

    if (!cameraStream) {
        return;
    }

    try {

        const predictions =
            await detectionModel.detect(video);

        console.log(
            "Detected objects:",
            predictions
        );

        if (predictions.length > 0) {

            const detected =
                predictions[0];

            console.log(
                "Object:",
                detected.class,
                "Confidence:",
                detected.score
            );

            if (detected.score >= 0.60) {

                status.innerText =
                    "🤖 Object detected: " +
                    detected.class;

            }

        } else {

            status.innerText =
                "🔍 Looking for the product...";

        }

    } catch (error) {

        console.error(
            "Detection error:",
            error
        );

    }
}


// ==========================================
// CAPTURE PRODUCT FROM CAMERA
// ==========================================

async function captureProduct() {

    const video =
        document.getElementById("cameraPreview");

    const canvas =
        document.getElementById("cameraCanvas");

    const status =
        document.getElementById("cameraStatus");

    if (!cameraStream) {

        status.innerText =
            "Please open the camera first.";

        speak(
            "Please open the camera first."
        );

        return;
    }

    // Capture current camera frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context =
        canvas.getContext("2d");

    context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );

    status.innerText =
        "🔍 Scanning product. Please wait.";

    // Stop microphone while processing
    if (voiceRecognition) {

        try {
            voiceRecognition.stop();
        } catch (error) {
            console.log(
                "Voice recognition already stopped."
            );
        }
    }

    speak(
        "Scanning the product. Please wait."
    );

    // Convert camera image to file
    canvas.toBlob(
        async function(blob) {

            try {

                const formData =
                    new FormData();

                const file =
                    new File(
                        [blob],
                        "camera_product.jpg",
                        {
                            type: "image/jpeg"
                        }
                    );

                formData.append(
                    "image",
                    file
                );

                const languageSelect =
                    document.getElementById(
                        "language"
                    );

                if (languageSelect) {

                    formData.append(
                        "language",
                        languageSelect.value
                    );
                }

                status.innerText =
                    "🤖 AI is analyzing the product...";

                const response =
                    await fetch(
                        "/predict",
                        {
                            method: "POST",

                            headers: {
                                "X-Requested-With":
                                    "XMLHttpRequest"
                            },

                            body: formData
                        }
                    );

                const data =
                    await response.json();

                if (!data.success) {

                    throw new Error(
                        "AI analysis failed."
                    );
                }

                // Stop camera
                if (cameraStream) {

                    cameraStream
                        .getTracks()
                        .forEach(
                            function(track) {
                                track.stop();
                            }
                        );

                    cameraStream = null;
                }

                video.style.display =
                    "none";

                document.getElementById(
                    "captureBtn"
                ).style.display =
                    "none";

                document.getElementById(
                    "startCameraBtn"
                ).style.display =
                    "inline-block";

                // Show result on page
                let details =
                    document.querySelector(
                        ".details"
                    );

                if (!details) {

                    details =
                        document.createElement(
                            "div"
                        );

                    details.className =
                        "details";

                    document
                        .querySelector(
                            ".container"
                        )
                        .appendChild(details);
                }

                details.innerHTML = `
                    <h3>🛍️Product Details</h3>
                    <p>${data.result}</p>

                    <button
                        type="button"
                        onclick="speakText()">
                        🔊 Listen
                    </button>

                    <button
                        type="button"
                        onclick="stopVoice()">
                        ⏹ Stop
                    </button>
                `;

                status.innerText =
                    "✅ Product scanned successfully.";

                // Read AI result
                speak(data.result);

            }

            catch (error) {

                console.error(
                    "Camera scan error:",
                    error
                );

                status.innerText =
                    "❌ Product scanning failed.";

                speak(
                    "Sorry, I could not analyze the product."
                );
            }

        },
        "image/jpeg",
        0.9
    );
}

// ==========================================
// SIDEBAR MENU
// ==========================================

function toggleSidebar() {

    const sidebar = document.getElementById("sidebar");

    if (!sidebar) {
        return;
    }

    sidebar.classList.toggle("active");
}