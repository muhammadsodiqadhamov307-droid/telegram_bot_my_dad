import axios from 'axios';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testAxios() {
    try {
        // Fetch a tiny test image (e.g. a 1x1 pixel) directly via axios as an arraybuffer
        console.log("Downloading image...");
        // Using a public URL for a placeholder image as a test
        const response = await axios.get('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png', {
            responseType: 'arraybuffer'
        });

        // This is the guaranteed safe way to make a Node Buffer from ArrayBuffer
        const buffer = Buffer.from(response.data);
        console.log("Buffer size:", buffer.length);

        console.log("Sending to Gemini...");
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }, { apiVersion: "v1beta" });
        const result = await model.generateContent([
            "What is this?",
            { inlineData: { mimeType: "image/png", data: buffer.toString('base64') } }
        ]);

        console.log("Gemini Output:", result.response.text());

    } catch (e) {
        console.error("Crash:", e.stack);
    }
}
testAxios();
