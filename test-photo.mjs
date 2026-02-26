import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

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

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), 60000)
        );

        return await Promise.race([generatePromise, timeoutPromise]);

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
}

async function test() {
    try {
        // Just use a tiny base64 encoded buffer
        const fakeImageBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", 'base64');
        const prompt = "What is this image?";
        
        console.log("Calling wrapper...");
        let result = await generateContentWithRotation(prompt, fakeImageBuffer, "image/jpeg");
        console.log("Result:", result.response.text());
        
    } catch (e) {
        console.error("Crash:", e.stack);
    }
}
test();
