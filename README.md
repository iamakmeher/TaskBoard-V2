# 📋 TaskBoard — Premium jQuery Task Manager

TaskBoard is a responsive, modern task management web application designed to run seamlessly on desktop, mobile, and tablets. It is fully converted into a **Progressive Web App (PWA)** with **real-time cloud database synchronization** and **complete offline usability**.

🔗 **Live Link**: [Deploy on Netlify to get your link!](https://your-taskboard-site.netlify.app)

---

## ✨ Features

*   📱 **Progressive Web App (PWA)**: Installable directly on Android and iOS home screens as a native application with a custom high-quality launcher icon.
*   🔄 **Real-Time Synchronization**: Fully synced across laptop, mobile, and tablet screens simultaneously using Firebase Firestore. Modifying a card on one screen updates all other screens instantly.
*   💾 **True Offline Support**: Work completely offline. View, add, edit, or delete tasks. The app stores modifications locally in a persistent cache and uploads them automatically when connection is restored.
*   🔒 **Secure Authentication**: User sessions managed via Firebase Authentication with automatic local storage privacy cleanup on logout.
*   🎨 **Rich Dynamic Aesthetics**: Modern UI with real-time customizable accent color schemes, spacing densities, typography settings, and automatic dark mode synchronization.
*   🗑️ **Recycle Bin System**: Safely delete tasks and restore them to any board of your choice.

---

## 🛠️ Technology Stack

*   **Frontend**: HTML5, CSS3 (with extensive tablet/mobile `@media` responsive queries), JavaScript (ES6+ Modules)
*   **Libraries**: jQuery (v3.7.1)
*   **Database & Auth**: Firebase Firestore & Firebase Auth
*   **Hosting**: Netlify

---

## ⚙️ How to Deploy & Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/iamakmeher/TaskBoard-V2.git
    ```
2.  **Deploy to Netlify**:
    *   Connect your GitHub repository to [Netlify](https://www.netlify.com/).
    *   Set the **Publish Directory** to `.` (the root).
    *   Netlify will automatically build and serve the application over HTTPS, enabling full PWA capabilities.
