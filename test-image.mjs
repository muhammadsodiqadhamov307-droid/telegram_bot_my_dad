import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
    try {
        const model = genAI.getGenerativeModel(
            { model: "gemini-3-flash-preview" },
            { apiVersion: "v1beta" }
        );
        const result = await model.generateContent([
            "What is this?",
            {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" // tiny 1x1 image
                }
            }
        ]);
        console.log("Image result:", result.response.text());
    } catch (e) {
        console.error("Error with image upload:", e.stack);
    }
}
test();
