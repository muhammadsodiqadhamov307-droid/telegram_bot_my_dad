
import React, { useState, useRef } from 'react';
import { processVoiceExpense } from '../services/geminiService';
import { GeminiExtraction } from '../types';

interface VoiceRecorderProps {
  onExtracted: (data: GeminiExtraction) => void;
  onError: (msg: string) => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onExtracted, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setIsProcessing(true);
        
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            const result = await processVoiceExpense(base64Audio);
            if (result) {
              onExtracted(result);
            } else {
              onError("Ma'lumotlarni ajratib bo'lmadi. Qayta urinib ko'ring.");
            }
            setIsProcessing(false);
          };
        } catch (err) {
          onError("Ovozli xabarni qayta ishlashda xato yuz berdi.");
          setIsProcessing(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      onError("Mikrofonga ruxsat berilmadi yoki xato yuz berdi.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {isProcessing ? (
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
          <p className="text-indigo-600 font-medium text-sm animate-pulse italic">AI qayta ishlamoqda...</p>
        </div>
      ) : (
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isRecording ? 'bg-rose-500 scale-110 shadow-rose-200' : 'bg-indigo-600 active:scale-95 shadow-indigo-200'
          }`}
        >
          {isRecording && (
            <div className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-25"></div>
          )}
          <svg className="w-8 h-8 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
      )}
      <p className="mt-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">
        {isRecording ? 'Gapiring...' : isProcessing ? '' : 'Ovozli xarajat uchun bosing'}
      </p>
    </div>
  );
};

export default VoiceRecorder;
