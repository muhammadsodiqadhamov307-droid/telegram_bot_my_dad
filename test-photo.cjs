const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateContentWithRotation(prompt, buffer, mimeType = "audio/ogg") {
    try {
        const model = genAI.getGenerativeModel(
            { model: "gemini-3-flash-preview" },
            { apiVersion: "v1beta" }
        );

        const generatePromise = model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: mimeType,
                    data: buffer.toString('base64')
                }
            }
        ]);

        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), 60000);
        });

        const result = await Promise.race([generatePromise, timeoutPromise]);
        clearTimeout(timeoutId); // Prevent unhandled rejection later
        
        return result;

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
}

async function test() {
    try {
        const fakeImageBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", 'base64');
        const buffer = fakeImageBuffer;
        const mimeType = "image/jpeg";
        const prompt = "What is this image?";
        
        console.log("Calling wrapper...");
        let result = await generateContentWithRotation(prompt, buffer, mimeType);
        console.log("Result:", result.response?.text ? result.response.text() : "No text method");
        
    } catch (e) {
        console.error("Crash:", e.stack);
    }
}
test();
