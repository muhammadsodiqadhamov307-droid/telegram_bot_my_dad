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
        const result = await model.generateContent("Hello");
        console.log("3-flash-preview result:", result.response.text());
    } catch (e) {
        console.error("Error with gemini-3-flash-preview:", e.message);
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent("Hello");
        console.log("flash-latest result:", result.response.text());
    } catch (e) {
        console.error("Error with gemini-flash-latest:", e.message);
    }
}
test();
