const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
    try {
        const fakeImageBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", 'base64');
        const buffer = fakeImageBuffer;
        const mimeType = "image/jpeg";
        const prompt = "What is this image?";
        
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
        
        console.log("Awaiting...");
        let result = await generatePromise;
        console.log("Done");
        
    } catch (e) {
        console.error("Caught:", e.message);
    }
}
test();
