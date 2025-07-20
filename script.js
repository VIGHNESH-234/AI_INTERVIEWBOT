// Global state
let currentUser = null;
let selectedRole = null;
// IMPORTANT SECURITY NOTE: Embedding your API key directly in client-side JavaScript is highly insecure.
// Anyone viewing your page's source code can see and steal your API key.
// For a real-world application, you should always handle API calls from a secure backend server.
const API_KEY_HARDCODED = "AIzaSyDcqTbS4MuAxb-byji2-OQz7EggJtPw3b8"; // Your provided API key
let apiKey = API_KEY_HARDCODED; // Initialize with the hardcoded key
let questionCount = 0;
let maxQuestions = 6; // Changed from 5 to 6
let askedQuestions = []; // Stores {question: "...", userAnswer: "...", feedback: "..."}
let waitingForNextQuestion = false;
// Mock user database
let users = JSON.parse(localStorage.getItem('interviewBotUsers') || '[]');

// Speech Recognition variables
let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

// Speech Synthesis variables
let synth = window.speechSynthesis;
let speechEnabled = true;
let voices = [];

// Role configurations (used for topics and titles, questions will be AI-generated)
const roleConfigs = {
    frontend: {
        title: "Frontend Developer",
        topics: ["HTML/CSS", "JavaScript", "React", "Vue", "Angular", "Responsive Design", "Performance Optimization", "State Management", "Bundlers"],
    },
    backend: {
        title: "Backend Developer",
        topics: ["Node.js", "Python", "Java", "APIs (REST, GraphQL)", "Databases (SQL, NoSQL)", "Authentication & Authorization", "Microservices", "Scalability"],
    },
    fullstack: {
        title: "Full Stack Developer",
        topics: ["Frontend (React/Vue)", "Backend (Node.js/Python)", "Databases", "APIs", "System Design", "Deployment", "Security", "DevOps Principles"],
    },
    dataanalyst: {
        title: "Data Analyst",
        topics: ["SQL", "Python (Pandas, NumPy)", "Excel", "Data Visualization (Tableau, Power BI)", "Statistics", "Data Cleaning", "Data Modeling", "A/B Testing"],
    },
    devops: {
        title: "DevOps Engineer",
        topics: ["CI/CD", "Docker", "Kubernetes", "AWS/Azure/GCP", "Infrastructure as Code (Terraform)", "Monitoring & Logging", "Scripting (Bash, Python)", "Networking"],
    },
    productmanager: {
        title: "Product Manager",
        topics: ["Market Research", "Product Roadmapping", "User Stories", "Metrics (OKRs, KPIs)", "Prioritization Frameworks (RICE, MoSCoW)", "User Research", "Agile Methodologies"],
    }
};

// --- API Interaction Functions ---
async function callGeminiAPI(promptContent, modelName = "gemini-2.0-flash") {
    // API key is now directly used from API_KEY_HARDCODED
    if (!apiKey || apiKey.length < 20) { // Basic check for validity
        throw new Error("Gemini API Key is missing or invalid. Please ensure it's set correctly in the script.");
    }

    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': apiKey // Use the hardcoded API key
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: promptContent
                    }]
                }],
                generationConfig: {
                    temperature: 0.7, // Adjust for creativity vs. consistency
                    maxOutputTokens: 500 // Limit response length
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API error: ${response.status} - ${errorData.error.message || response.statusText}`);
        }

        const data = await response.json();
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            return data.candidates[0].content.parts[0].text;
        } else {
            throw new Error("Invalid response format from Gemini API.");
        }

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw error; // Re-throw to be caught by calling function
    }
}


// --- Authentication functions ---
function flipToRegister() {
    document.getElementById('flipCard').classList.add('flipped');
}

function flipToLogin() {
    document.getElementById('flipCard').classList.remove('flipped');
}

function register() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const question = document.getElementById('regSecurityQuestion').value;
    const answer = document.getElementById('regSecurityAnswer').value;

    if (!name || !email || !password || !question || !answer) {
        showStatus("Please fill in all fields.", 'error');
        return;
    }

    if (localStorage.getItem(email)) {
        showStatus("Account with this email already exists. Please login or use a different email.", 'error');
        return;
    }

    const user = { name, email, password, question, answer };
    localStorage.setItem(email, JSON.stringify(user));

    showStatus("Registered successfully! Please log in.", 'success');
    flipToLogin();
}

function handleForgotPassword() {
    const email = prompt("Enter your registered email:");
    if (!email) return;

    const userData = localStorage.getItem(email);
    if (!userData) {
        showStatus("No account found with this email.", 'error');
        return;
    }

    const user = JSON.parse(userData);
    const answer = prompt(`Security question:\n${user.question}`);

    if (answer && answer.toLowerCase().trim() === user.answer.toLowerCase().trim()) {
        const newPassword = prompt("Correct! Enter your new password:");
        if (newPassword) {
            user.password = newPassword;
            localStorage.setItem(email, JSON.stringify(user));
            showStatus("Password reset successful!", 'success');
        } else {
            showStatus("Password reset cancelled.", 'info');
        }
    } else {
        showStatus("Incorrect answer. Cannot reset password.", 'error');
    }
}

function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showStatus('Please fill in all fields', 'error');
        return;
    }

    const userData = localStorage.getItem(email);
    if (!userData) {
        showStatus('No account found with this email. Please register.', 'error');
        setTimeout(() => {
            flipToRegister();
            document.getElementById('regEmail').value = email;
        }, 2000);
        return;
    }

    const user = JSON.parse(userData);
    if (user.password !== password) {
        showStatus('Incorrect password. Please try again.', 'error');
        document.getElementById('loginPassword').classList.add('error-input');
        document.getElementById('loginPassword').value = '';
        setTimeout(() => {
            document.getElementById('loginPassword').focus();
        }, 100);
        return;
    }

    currentUser = user;
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('roleSection').classList.add('show');

    showStatus(`Welcome back, ${user.name}!`, 'success');
    document.getElementById('loginPassword').classList.remove('error-input');
}

function logout() {
    currentUser = null;
    selectedRole = null;
    apiKey = API_KEY_HARDCODED; // Reset API key to hardcoded value on logout
    questionCount = 0;
    askedQuestions = [];
    waitingForNextQuestion = false;

    document.getElementById('roleSection').classList.remove('show');
    document.getElementById('chatSection').classList.remove('show');
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('regName').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('regPassword').value = '';

    clearChatMessages();
    showStatus('Logged out successfully.', 'success');
    stopSpeechRecognitionAndSynthesis();
}

// --- Role Selection functions ---
function selectRole(roleKey) {
    document.querySelectorAll('.role-card').forEach(card => {
        card.classList.remove('selected');
    });

    const selectedCard = event.currentTarget;
    selectedCard.classList.add('selected');

    selectedRole = roleKey;
}

async function startInterview() {
    if (!selectedRole) {
        showStatus('Please select an interview focus role.', 'error');
        return;
    }

    // API key is now hardcoded, no need to read from input field
    // Removed: const inputApiKey = document.getElementById('apiKey').value;
    // Removed: if (!inputApiKey || inputApiKey.length < 20) { ... }
    // apiKey = inputApiKey; // This line is no longer needed here

    document.getElementById('roleSection').classList.remove('show');
    document.getElementById('chatSection').classList.add('show');
    document.getElementById('chatTitle').textContent = `Interview Preparation: ${roleConfigs[selectedRole].title}`;

    clearChatMessages();
    addMessage("bot", `Great choice! We'll start your interview preparation for **${roleConfigs[selectedRole].title}**. Type 'start' to receive your first question.`, true);

    questionCount = 0;
    askedQuestions = [];
    waitingForNextQuestion = false;
    updateProgressBar();
}

function endInterview() {
    const questionsLeft = maxQuestions - questionCount;
    const confirmationDialog = document.getElementById('confirmationDialog');
    const confirmationTitle = document.getElementById('confirmationTitle');
    const confirmationMessage = document.getElementById('confirmationMessage');

    if (questionsLeft > 0 && questionCount > 0) {
        confirmationTitle.textContent = "Incomplete Interview Session";
        confirmationMessage.innerHTML = `You have attempted <strong>${questionCount}</strong> questions and have <strong>${questionsLeft} questions remaining</strong>.<br><br>Ending now will not save your progress.<br>Are you sure you want to end the session?`;
        confirmationDialog.style.display = "flex";
    } else if (questionCount === 0) {
        confirmationTitle.textContent = "No Questions Attempted";
        confirmationMessage.innerHTML = "You haven't answered any questions yet.<br>Are you sure you want to end the session?";
        confirmationDialog.style.display = "flex";
    } else {
        resetInterviewSession();
    }
}

function confirmEndInterview() {
    document.getElementById('confirmationDialog').style.display = "none";
    resetInterviewSession();
}

function cancelEndInterview() {
    document.getElementById('confirmationDialog').style.display = "none";
    showStatus("Interview session continued", "success");
}

function resetInterviewSession() {
    selectedRole = null;
    questionCount = 0;
    askedQuestions = [];
    waitingForNextQuestion = false;
    document.getElementById('chatSection').classList.remove('show');
    document.getElementById('roleSection').classList.add('show');
    clearChatMessages();
    addMessage("bot", "Welcome! I'm your AI interview coach. Let's start with some questions to help you prepare. Type 'start' to begin!");
    showStatus('Interview session ended.', 'info');
    stopSpeechRecognitionAndSynthesis();
}

function stopSpeechRecognitionAndSynthesis() {
    if (isListening && recognition) {
        recognition.stop();
        isListening = false;
        document.getElementById('micButton').style.background = 'linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)';
        document.getElementById('userInput').placeholder = "Type or speak your answer here...";
        document.getElementById('voiceRecordingOverlay').style.display = "none";
        document.getElementById('recordingMic').style.animation = 'none';
    }
    if (synth.speaking) {
        synth.cancel();
    }
}

// --- Chat functions ---
function addMessage(sender, text, speak = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    messageDiv.innerHTML = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (speak && speechEnabled) {
        speakText(text); // Call speakText directly with the full text
    }
}

function clearChatMessages() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    if (waitingForNextQuestion) {
        showStatus("Please wait for the current action to complete.", "info");
        return;
    }

    const userInputField = document.getElementById('userInput');
    const userText = userInputField.value.trim();

    if (userText === '') return;

    stopSpeechRecognitionAndSynthesis(); // Stop any active speech

    addMessage('user', userText);
    userInputField.value = '';

    if (userText.toLowerCase() === 'start' && questionCount === 0) {
        await askNextQuestion();
    } else if (askedQuestions.length > 0 && questionCount <= maxQuestions) {
        const currentQuestionObj = askedQuestions[askedQuestions.length - 1];
        currentQuestionObj.userAnswer = userText; // Store user's answer
        waitingForNextQuestion = true;
        await evaluateAnswer(currentQuestionObj, userText);
        waitingForNextQuestion = false;

        if (questionCount < maxQuestions) {
            await askNextQuestion();
        } else {
            addMessage('bot', "You've completed all the practice questions for this session! Great job! If you want to continue, you can type 'start' for a new session or choose a different role.", true);
        }
    } else {
        addMessage('bot', "Please type or speak 'start' to begin your interview preparation or to start a new session.", true);
    }
}

async function askNextQuestion() {
    if (!selectedRole || !roleConfigs[selectedRole]) {
        addMessage('bot', "An error occurred. Please select a role first.", true);
        return;
    }

    if (!apiKey) { // This check should now always pass if API_KEY_HARDCODED is set
        showStatus("API Key is not set. Please check the script.", "error");
        return;
    }

    if (questionCount >= maxQuestions) {
        addMessage('bot', "You've completed all the practice questions for this session! Great job! If you want to continue, you can type 'start' for a new session or choose a different role.", true);
        return;
    }

    addMessage('bot', `<span class="loading"></span> Generating next question...`);
    const chatMessages = document.getElementById('chatMessages');
    const loadingMessage = chatMessages.lastChild;

    try {
        const roleInfo = roleConfigs[selectedRole];
        // Modified prompt to ask for basic questions
        let prompt = `You are an AI interviewer for a ${roleInfo.title} position. Ask one very basic and fundamental interview question. Focus on core, entry-level concepts from these topics: ${roleInfo.topics.join(', ')}. The question should be straightforward and suitable for someone new to the field. Do not provide answers or hints. Just ask the question. Keep the question concise.`;

        // Provide context of previous questions to avoid repetition
        if (askedQuestions.length > 0) {
            prompt += ` Avoid repeating questions or topics already covered. Previous questions asked: ${askedQuestions.map(q => q.question).join('; ')}.`;
        }

        const generatedQuestionText = await callGeminiAPI(prompt, "gemini-2.0-flash");

        loadingMessage.remove();

        const newQuestion = {
            question: generatedQuestionText,
            userAnswer: "", // Will be filled by the user later
            feedback: "" // Will be filled by AI evaluation later
        };
        addMessage('bot', newQuestion.question, true);
        askedQuestions.push(newQuestion);
        questionCount++;
        updateProgressBar();

    } catch (error) {
        loadingMessage.remove();
        console.error("Error generating question from Gemini:", error);
        showStatus(`Failed to generate question: ${error.message}. Please check your API key and network connection.`, 'error');
        addMessage('bot', 'Sorry, I could not generate a question right now. Please try again.', true);
    }
}

async function evaluateAnswer(questionObj, userAnswer) {
    if (!apiKey) { // This check should now always pass if API_KEY_HARDCODED is set
        showStatus("API Key is not set. Please check the script.", "error");
        return;
    }

    addMessage('bot', `<span class="loading"></span> Evaluating your answer...`);
    const chatMessages = document.getElementById('chatMessages');
    const loadingMessage = chatMessages.lastChild;

    try {
        // Modified prompt to ask for short and nice feedback, with clear structure
        const evaluationPrompt = `You are an AI interview coach providing constructive feedback.
The question asked was: "${questionObj.question}"
The candidate's answer was: "${userAnswer}"

Please provide short, nice feedback in exactly 3 to 4 concise sentences. Focus on the main strengths and one key area for improvement. Conclude with a very brief suggestion if appropriate. Do not include markdown headings or bullet points. Provide only the feedback text.`;

        const feedbackText = await callGeminiAPI(evaluationPrompt, "gemini-2.0-flash");
        loadingMessage.remove();

        questionObj.feedback = feedbackText; // Store the feedback
        addMessage('bot', feedbackText, true); // The addMessage function will handle speaking

    } catch (error) {
        loadingMessage.remove();
        console.error("Error evaluating answer with Gemini:", error);
        showStatus(`Failed to evaluate answer: ${error.message}. Please try again.`, 'error');
        addMessage('bot', 'Sorry, I could not evaluate your answer at this moment. Please try again.', true);
    }
}

function updateProgressBar() {
    const progressPercentage = (questionCount / maxQuestions) * 100;
    document.getElementById('progressBar').style.width = `${progressPercentage}%`;
    document.getElementById('progressText').textContent = `Question ${questionCount}/${maxQuestions}`;
}

function showStatus(message, type) {
    let statusDiv = document.getElementById('statusMessage');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.classList.add('status-indicator');
        statusDiv.id = 'statusMessage';
        document.querySelector('.container').prepend(statusDiv);
    }
    statusDiv.textContent = message;
    statusDiv.className = `status-indicator status-${type} show`;

    if (type === 'error') {
        statusDiv.style.cursor = 'pointer';
        statusDiv.onclick = () => statusDiv.classList.remove('show');
    }

    setTimeout(() => {
        statusDiv.classList.remove('show');
    }, 5000);
}

// --- Voice Input Functions ---
function initializeSpeechRecognition() {
    if (!SpeechRecognition) {
        showStatus("Speech recognition is not supported in your browser.", "error");
        document.getElementById('micButton').disabled = true;
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let fullTranscript = '';

    recognition.onstart = function() {
        isListening = true;
        fullTranscript = '';
        document.getElementById('userInput').placeholder = "Listening...";
        document.getElementById('micButton').style.background = 'linear-gradient(135deg, #FF5722 0%, #FFC107 100%)';
        document.getElementById('recordingMic').style.animation = 'pulse 1.5s infinite';
        showStatus("Recording... Click 'Stop Recording' when finished.", "info");
        if (synth.speaking) {
            synth.cancel();
        }
    };

    recognition.onresult = function(event) {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                fullTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        document.getElementById('userInput').value = fullTranscript + interimTranscript;
    };

    recognition.onerror = function(event) {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'no-speech') {
            return;
        }
        showStatus(`Speech recognition error: ${event.error}`, "error");
        stopVoiceInput();
    };

    recognition.onend = function() {
        if (isListening) {
            recognition.start();
        }
    };
}

function startVoiceInput() {
    if (!recognition) {
        showStatus("Speech recognition is not available. Please try a different browser.", "error");
        return;
    }
    // Check for microphone permission if not already granted
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
            document.getElementById('voiceRecordingOverlay').style.display = "flex";
            recognition.start();
        })
        .catch(err => {
            showStatus("Microphone permission denied. Please enable it in your browser settings to use voice input.", "error");
            console.error("Microphone access error:", err);
        });
}

function stopVoiceInput() {
    if (isListening && recognition) {
        isListening = false;
        recognition.stop();
        document.getElementById('micButton').style.background = 'linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)';
        document.getElementById('userInput').placeholder = "Type or speak your answer here...";
        document.getElementById('voiceRecordingOverlay').style.display = "none";
        document.getElementById('recordingMic').style.animation = 'none';

        sendMessage(); // Send the recorded message automatically
    }
}

// --- Text-to-Speech Functions ---
function initializeSpeechSynthesis() {
    if (!synth) {
        showStatus("Text-to-speech is not supported in your browser.", "error");
        document.getElementById('speakToggleButton').disabled = true;
        speechEnabled = false;
        return;
    }

    synth.onvoiceschanged = () => {
        voices = synth.getVoices();
    };

    if (synth.getVoices().length > 0) {
        voices = synth.getVoices();
    }
}

function speakText(text) {
    if (!speechEnabled || !synth) {
        return;
    }

    // Attempt to be more robust with markdown removal for speech, focusing on making it plain text
    // Remove all markdown formatting: bold, italics, headings, lists, links
    let cleanedText = text
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1')   // Remove italics (single asterisk)
        .replace(/##+\s*/g, '')      // Remove headings
        .replace(/^-+\s*/gm, '')     // Remove list hyphens
        .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Remove links (keep link text)

    // Remove multiple consecutive spaces and trim
    cleanedText = cleanedText.replace(/\s\s+/g, ' ').trim();

    // Cancel any ongoing speech before starting a new one
    if (synth.speaking) {
        synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.lang = 'en-US';
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error);
        showStatus(`Speech output error: ${event.error}`, "error");
    };

    synth.speak(utterance);
}

function toggleSpeechOutput() {
    speechEnabled = !speechEnabled;
    const speakButton = document.getElementById('speakToggleButton');
    if (speechEnabled) {
        speakButton.style.background = 'linear-gradient(135deg, #673AB7 0%, #9C27B0 100%)';
        speakButton.textContent = '🔊';
        showStatus("Speech output enabled.", "info");
    } else {
        speakButton.style.background = 'linear-gradient(135deg, #9E9E9E 0%, #616161 100%)';
        speakButton.textContent = '🔇';
        if (synth.speaking) {
            synth.cancel();
        }
        showStatus("Speech output disabled.", "info");
    }
}

// --- Theme toggle function ---
function toggleTheme() {
    const body = document.body;
    const button = document.getElementById('themeToggle');

    body.classList.toggle('dark');
    const isDark = body.classList.contains('dark');
    button.textContent = isDark ? '☀️' : '🌙';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeSpeechRecognition();
    initializeSpeechSynthesis();

    if (currentUser) {
        document.getElementById('authSection').classList.add('hidden');
        document.getElementById('roleSection').classList.add('show');
        showStatus(`Welcome back, ${currentUser.name}!`, 'success');
    } else {
        document.getElementById('authSection').classList.remove('hidden');
        document.getElementById('roleSection').classList.remove('show');
        document.getElementById('chatSection').classList.remove('show');
    }
    
    // Hide the API key input field as it's now hardcoded
    const apiKeyInputGroup = document.querySelector('.start-interview-section .form-group');
    if (apiKeyInputGroup) {
        apiKeyInputGroup.style.display = 'none';
    }
});