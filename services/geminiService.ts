
import { GeminiExtraction } from "../types";

export const processVoiceExpense = async (base64Audio: string): Promise<GeminiExtraction | null> => {
  try {
    const response = await fetch('/api/analyze-voice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audioData: base64Audio }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    return data as GeminiExtraction;

  } catch (error) {
    console.error("Voice processing error:", error);
    return null;
  }
};
