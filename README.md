# AI Model Sabrina Ⅱ

AI Model Sabrina Ⅱ is a professional, high-performance AI model comparison platform designed to help developers and researchers evaluate different Large Language Models (LLMs) side-by-side with a single prompt.

## 🚀 Features

- **Multi-Model Orchestration**: Compare results from multiple models simultaneously.
- **Dual Channel Support**: 
  - **China 渠道**: Optimized for domestic Chinese models (Doubao, DeepSeek, GLM, etc.) via Volcengine Coding Plan.
  - **Global Models**: Access world-class models like GPT-4o, Claude 3.5, and Gemini 1.5 Pro.
- **Clean UI/UX**: Apple-inspired design language for a focused and premium user experience.
- **Real-time Feedback**: Live status tracking (Thinking/Ready) for each model.
- **DDD Architecture**: Built with Domain-Driven Design principles for scalability and maintainability.

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Animations**: Framer Motion (motion/react)
- **Icons**: Lucide React
- **Backend**: Express.js (Vite Middleware mode)
- **Deployment**: Cloud Run / Containerized

## 📖 Usage

1. **Enter Prompt**: Type your question or code snippet in the main textarea.
2. **Select Models**: Choose the models you want to compare from the China or Global tabs.
3. **Run Comparison**: Click "Run Comparison" to see results side-by-side.
4. **Analyze**: Evaluate the reasoning, speed, and quality of each output.

## ⚙️ Configuration

The application requires the following environment variables for backend integration:

```env
# Volcengine China Configuration
CHINA_API_KEY=your_china_api_key

# Global Model Providers (if applicable)
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## 📄 License

© 2026 AI Model Sabrina Ⅱ. All rights reserved.
