// Global state
let currentUser = null;
let selectedRole = null;
let apiKey = null;
let questionCount = 0;
let maxQuestions = 5;
let currentQuestionIndex = 0;
let askedQuestions = [];
let waitingForNextQuestion = false;

// Mock user database
let users = JSON.parse(localStorage.getItem('interviewBotUsers') || '[]');

// Default OpenAI API Key
const DEFAULT_API_KEY = "YOUR_OPENAI_API_KEY_HERE";

// Voice recognition
let recognition;
let isRecording = false;
let speechSynthesisEnabled = true;

// Role configurations
const roleConfigs = {
  "Frontend Developer": {
    questions: [
      { question: "What is the virtual DOM in React?", expected: "It is a lightweight copy of the actual DOM used to improve performance." },
      { question: "Explain event delegation in JavaScript.", expected: "Event delegation is handling events at a higher level rather than each element." },
      { question: "What are the differences between CSS Grid and Flexbox?", expected: "Grid is two-dimensional; Flexbox is one-dimensional." }
    ]
  },
  "Backend Developer": {
    questions: [
      { question: "What is REST API?", expected: "REST API is an architectural style for networked applications using HTTP requests." },
      { question: "What is the difference between SQL and NoSQL databases?", expected: "SQL is structured and relational; NoSQL is unstructured and flexible." },
      { question: "How do you manage authentication securely?", expected: "Use OAuth, tokens, hashing, and secure storage." }
    ]
  },
  "Data Analyst": {
    questions: [
      { question: "What is a pivot table?", expected: "It summarizes large amounts of data in a table format." },
      { question: "Explain the difference between variance and standard deviation.", expected: "Variance is average squared deviation; standard deviation is its square root." },
      { question: "What is a p-value?", expected: "It indicates the probability that observed data occurred by chance." }
    ]
  }
};

// Authentication
function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const user = users.find(u => u.email === email && u.password === password);
  if (user) {
    currentUser = user;
    document.getElementById('authSection').classList.remove('show');
    document.getElementById('roleSection').classList.add('show');
    showStatus(`Welcome back, ${user.name}`, "success");
  } else {
    showStatus("Invalid credentials", "error");
  }
}

function register() {
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const existing = users.find(u => u.email === email);
  if (existing) {
    showStatus("Email already registered", "error");
    return;
  }
  const newUser = { name, email, password };
  users.push(newUser);
  localStorage.setItem('interviewBotUsers', JSON.stringify(users));
  showStatus("Registered successfully! Please log in.", "success");
  flipToLogin();
}

function flipToLogin() {
  document.getElementById('authSection').classList.add('flip');
}

function flipToRegister() {
  document.getElementById('authSection').classList.remove('flip');
}

function toggleTheme() {
  document.body.classList.toggle("dark");
}

// Role selection
function selectRole(roleKey) {
  document.querySelectorAll('.role-card').forEach(card => {
    card.classList.remove('selected');
  });
  const selectedCard = event.currentTarget;
  selectedCard.classList.add('selected');
  selectedRole = roleKey;

  const suggestion = roleConfigs[roleKey]?.questions?.[0]?.question;
  if (suggestion) {
    showStatus(`Tip: You can type 'start' or try: “${suggestion}”`, "info");
  }
}

// Start interview
function startInterview() {
  if (!selectedRole) {
    showStatus('Please select an interview focus role.', 'error');
    return;
  }

  const enteredKey = document.getElementById('apiKey').value.trim();

  if (enteredKey) {
    localStorage.setItem("openai_api_key", enteredKey);
  }

  apiKey = enteredKey || localStorage.getItem("openai_api_key") || DEFAULT_API_KEY;

  clearChatMessages();
  askedQuestions = [];
  currentQuestionIndex = 0;
  questionCount = 0;
  waitingForNextQuestion = false;

  updateProgressBar();
  showStatus(`Interview started for role: ${selectedRole}`, "success");
  addMessage("bot", "Great! Let's begin. Type 'start' to get your first question.");
}

// Handle user input
function sendMessage() {
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  addMessage("user", text);
  input.value = "";

  if (waitingForNextQuestion && text.toLowerCase() === "next") {
    askNextQuestion();
    return;
  }

  if (text.toLowerCase() === "start") {
    askNextQuestion();
  } else {
    evaluateAnswer(text);
  }
}

// Ask a new question
function askNextQuestion() {
  if (questionCount >= maxQuestions) {
    addMessage("bot", "🎉 Interview completed! You did great!");
    showStatus("Interview session completed.", "success");
    return;
  }

  const questions = roleConfigs[selectedRole].questions;
  const unused = questions.filter((_, idx) => !askedQuestions.includes(idx));

  if (unused.length === 0) {
    addMessage("bot", "No more questions left.");
    return;
  }

  const idx = questions.findIndex(q => !askedQuestions.includes(questions.indexOf(q)));
  const question = questions[idx];

  askedQuestions.push(idx);
  currentQuestionIndex = idx;
  questionCount++;
  waitingForNextQuestion = true;

  addMessage("bot", `🧠 Q${questionCount}: ${question.question}`);
  updateProgressBar();
}

// Evaluate user answer
async function evaluateAnswer(userAnswer) {
  waitingForNextQuestion = false;
  const role = selectedRole;
  const question = roleConfigs[role].questions[currentQuestionIndex].question;
  const expected = roleConfigs[role].questions[currentQuestionIndex].expected;

  const prompt = `Role: ${role}\n\nQuestion: ${question}\nExpected Answer: ${expected}\nUser's Answer: ${userAnswer}\n\nEvaluate the answer and give brief feedback with a rating out of 10.`;

  try {
    const response = await fetch("https://api.openai.com/v1/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "text-davinci-003",
        prompt,
        max_tokens: 150,
        temperature: 0.7
      })
    });

    const data = await response.json();
    const feedback = data.choices[0].text.trim();
    addMessage("bot", `📋 Feedback: ${feedback}`);
  } catch (error) {
    console.error("Error evaluating answer:", error);
    addMessage("bot", "❌ Error fetching feedback from AI.");
  }
}

// Chat utilities
function addMessage(sender, text) {
  const chat = document.getElementById("chatMessages");
  const msg = document.createElement("div");
  msg.className = `message ${sender}`;
  msg.innerText = text;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;

  if (speechSynthesisEnabled && sender === "bot") {
    speakText(text);
  }
}

function clearChatMessages() {
  document.getElementById("chatMessages").innerHTML = "";
}

function updateProgressBar() {
  const percent = (questionCount / maxQuestions) * 100;
  document.getElementById("progressBar").style.width = `${percent}%`;
  document.getElementById("progressText").innerText = `Question ${questionCount}/${maxQuestions}`;
}

function showStatus(message, type = "info") {
  const status = document.getElementById("statusMessage");
  status.textContent = message;
  status.className = `status-indicator show ${type}`;
  setTimeout(() => {
    status.classList.remove("show");
  }, 4000);
}

function handleKeyPress(e) {
  if (e.key === "Enter") {
    sendMessage();
  }
}

// Voice input
function startVoiceInput() {
  if (!('webkitSpeechRecognition' in window)) {
    showStatus("Speech recognition not supported in this browser.", "error");
    return;
  }

  recognition = new webkitSpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isRecording = true;
    document.getElementById("voiceRecordingOverlay").style.display = "flex";
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("userInput").value = transcript;
    sendMessage();
  };

  recognition.onerror = (e) => {
    console.error("Voice error:", e);
    showStatus("Voice input failed", "error");
  };

  recognition.onend = () => {
    isRecording = false;
    document.getElementById("voiceRecordingOverlay").style.display = "none";
  };

  recognition.start();
}

// Speech output
function speakText(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = speechSynthesis.getVoices()[0];
  speechSynthesis.speak(utterance);
}

function toggleSpeechOutput() {
  speechSynthesisEnabled = !speechSynthesisEnabled;
  const label = speechSynthesisEnabled ? "🔊" : "🔇";
  document.getElementById("speakToggleButton").innerText = label;
}

// Export chat
function exportChat() {
  const chatMessages = document.querySelectorAll('#chatMessages .message');
  if (chatMessages.length === 0) {
    showStatus("No conversation to export.", "info");
    return;
  }

  let content = "AI InterviewBot - Conversation Log\n\n";
  chatMessages.forEach(msg => {
    const role = msg.classList.contains('bot') ? 'Bot' : 'You';
    content += `${role}: ${msg.textContent.trim()}\n\n`;
  });

  const blob = new Blob([content], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "AI_InterviewBot_Conversation.txt";
  a.click();
}

// Load saved API key on page load
document.addEventListener('DOMContentLoaded', () => {
  const savedKey = localStorage.getItem("openai_api_key");
  if (savedKey) {
    document.getElementById("apiKey").value = savedKey;
  }
});
