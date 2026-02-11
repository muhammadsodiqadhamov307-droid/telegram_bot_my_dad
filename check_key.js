
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.GEMINI_API_KEY;

console.log("--- KEY DIAGNOSTICS ---");
if (!key) {
    console.error("❌ ERROR: Key is undefined or empty!");
    process.exit(1);
}
console.log(`Length: ${key.length}`);
console.log(`First 4: '${key.substring(0, 4)}'`);
console.log(`Last 4: '${key.substring(key.length - 4)}'`);

// Check for bad characters
if (key.includes(' ')) {
    console.error("⚠️ WARNING: Key contains SPACES! Edit .env to remove them.");
}
if (key.includes('"') || key.includes("'")) {
    console.error("⚠️ WARNING: Key contains QUOTES! Edit .env to remove them.");
}

console.log("\n--- ATTEMPTING CALL ---");
const genAI = new GoogleGenerativeAI(key);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

(async () => {
    try {
        const result = await model.generateContent("Hello, are you working?");
        console.log("✅ SUCCESS! Response:", result.response.text());
        console.log("The API Key is working correctly.");
    } catch (e) {
        console.error("❌ API ERROR:", e.message);
        if (e.message.includes("API_KEY_INVALID") || e.message.includes("400")) {
            console.log("\nPossible causes:");
            console.log("1. The key was copied incorrectly (check length/characters above)");
            console.log("2. The key is restricted (IP restrictions?)");
            console.log("3. 'Generative Language API' is not enabled in Google Cloud Console");
            console.log("4. Billing is not enabled (if using paid tier)");
        }
    }
})();
