"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { UploadCloud, Loader2, Volume2, VolumeX, Sparkles, Image as ImageIcon } from "lucide-react";
import { GoogleGenAI, Modality } from "@google/genai";
import Image from "next/image";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function playPcmAudio(base64Data: string) {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const floatArray = new Float32Array(len / 2);
  const dataView = new DataView(new ArrayBuffer(len));
  for (let i = 0; i < len; i++) {
    dataView.setUint8(i, binaryString.charCodeAt(i));
  }
  for (let i = 0; i < len / 2; i++) {
    const int16 = dataView.getInt16(i * 2, true);
    floatArray[i] = int16 / 32768.0;
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = audioContext.createBuffer(1, floatArray.length, 24000);
  audioBuffer.getChannelData(0).set(floatArray);

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
  
  return { source, audioContext };
}

export function GhostwriterInterface() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  
  const [isGeneratingTarget, setIsGeneratingTarget] = useState(false);
  const [story, setStory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [isReading, setIsReading] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError("Please select an image file.");
      return;
    }
    setError(null);
    setFileToUpload(file);
    const url = URL.createObjectURL(file);
    setSelectedImage(url);
    setStory(null); // reset story
  };

  const generateStory = async () => {
    if (!fileToUpload) return;
    
    setError(null);
    setIsGeneratingTarget(true);
    setStory(null);
    
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "AIzaSyC-v63zly6q2mer5J9C_n8taCcSK6YNu9A";
      if (!apiKey) {
        throw new Error("Missing Gemini API Key");
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const base64Data = await fileToBase64(fileToUpload);
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: fileToUpload.type,
              }
            },
            {
              text: "Analyze the mood, setting, and atmosphere of this image. Then, act as a master ghostwriter and write a captivating, evocative opening paragraph (around 100-150 words) to a story set in this world. Make it feel immersive and intriguing."
            }
          ]
        }
      });
      
      if (response.text) {
        setStory(response.text);
      } else {
        throw new Error("No text generated.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate story.");
    } finally {
      setIsGeneratingTarget(false);
    }
  };

  const readAloud = async () => {
    if (!story) return;
    if (isReading) {
      // Stop reading
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
      }
      setIsReading(false);
      return;
    }
    
    setIsGeneratingAudio(true);
    setError(null);
    
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "AIzaSyC-v63zly6q2mer5J9C_n8taCcSK6YNu9A";
      if (!apiKey) {
        throw new Error("Missing Gemini API Key");
      }
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: "Say expressively: " + story }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const { source, audioContext } = playPcmAudio(base64Audio);
        audioSourceRef.current = source;
        setIsReading(true);
        
        source.onended = () => {
          setIsReading(false);
          audioSourceRef.current = null;
        };
      } else {
         throw new Error("No audio returned by TTS.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate audio.");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  return (
    <div className="w-full max-w-[1024px] min-h-[768px] bg-[#FDFCFB] text-[#1A1A1A] font-sans flex flex-col p-8 md:p-12 overflow-hidden mx-auto shadow-sm ring-1 ring-black/5">
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-6 mb-12 sm:mb-16">
        <div className="space-y-1">
          <h1 className="text-xs tracking-[0.4em] font-bold uppercase text-[#9A948C]">Ink & Vision</h1>
          <p className="text-2xl font-light italic font-serif tracking-tight">The Ghostwriter&apos;s Studio</p>
        </div>
        <div className="flex gap-8 text-[10px] uppercase tracking-widest text-[#9A948C] font-semibold">
          <span className="border-b border-[#1A1A1A] pb-1 cursor-pointer text-[#1A1A1A]">Compose</span>
          <span className="cursor-pointer hover:text-[#1A1A1A] transition-colors">Archive</span>
          <span className="cursor-pointer hover:text-[#1A1A1A] transition-colors">Settings</span>
        </div>
      </header>

      {/* Main Interface */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-12">
        {/* Image Section */}
        <div className="col-span-1 md:col-span-5 flex flex-col">
          <div 
            className="relative w-full aspect-[4/5] bg-[#F5F2EE] rounded-sm overflow-hidden border border-[#EEEAE3] group transition-all"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {selectedImage ? (
              <>
                <div 
                  className="absolute inset-0 bg-cover bg-center grayscale-[0.3] opacity-90 transition-opacity" 
                  style={{ backgroundImage: `url(${selectedImage})` }}
                />
                {(story || isGeneratingTarget) && (
                  <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-2 z-10">
                    {story && (
                      <div className="flex flex-wrap gap-2">
                        <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-[10px] uppercase tracking-tighter rounded-full border border-black/5">Mood: Analyzed</span>
                        <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-[10px] uppercase tracking-tighter rounded-full border border-black/5">Scene: Extracted</span>
                      </div>
                    )}
                    <div className="px-3 py-1 bg-black/80 text-white text-[9px] uppercase tracking-[0.2em] w-fit rounded-sm">
                      {isGeneratingTarget ? "Analyzing Scene..." : "AI Analysis Complete"}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-[#9A948C]">
                {isGeneratingTarget ? (
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                ) : (
                  <UploadCloud className="w-8 h-8 mb-4 opacity-50" />
                )}
                <p className="text-[10px] uppercase tracking-widest font-semibold mb-1">Upload Source Image</p>
                <p className="text-[10px] opacity-70">Drag and drop or click here</p>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileInput}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            )}

            {selectedImage && !isGeneratingTarget && (
               <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileInput}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
               />
            )}
          </div>
          
          <div className="mt-4 flex items-center justify-between text-[11px] text-[#9A948C]">
            <span className="uppercase tracking-wider truncate mr-4">
              {fileToUpload ? `FILE: ${fileToUpload.name}` : "AWAITING UPLOAD"}
            </span>
            {selectedImage && !isGeneratingTarget && !story && (
               <button onClick={generateStory} className="underline underline-offset-4 hover:text-[#1A1A1A] uppercase tracking-wider shrink-0 transition-colors">
                 Ghostwrite
               </button>
            )}
            {selectedImage && (isGeneratingTarget || story) && (
              <button onClick={() => { setSelectedImage(null); setFileToUpload(null); setStory(null); }} className="underline underline-offset-4 hover:text-[#1A1A1A] uppercase tracking-wider shrink-0 transition-colors">
                 Reset
              </button>
            )}
          </div>
        </div>

        {/* Narrative Section */}
        <div className="col-span-1 md:col-span-7 flex flex-col justify-center max-w-xl md:pr-8">
          {error ? (
             <div className="p-4 bg-red-50 text-red-600 border border-red-100 text-xs uppercase tracking-widest font-semibold rounded-sm">
               Error: {error}
             </div>
          ) : story ? (
            <div className="space-y-8 animate-in fade-in duration-700 w-full">
              <div className="w-12 h-[1px] bg-[#1A1A1A]"></div>
              
              <div className="space-y-6">
                <p className="text-xl md:text-[28px] leading-[1.6] md:leading-[1.4] font-serif text-[#2D2A26] drop-shadow-sm whitespace-pre-wrap">
                  {story}
                </p>
              </div>

              {/* Controls */}
              <div className="pt-12 flex flex-wrap items-center gap-6">
                <button 
                  onClick={readAloud}
                  disabled={isGeneratingAudio}
                  className="flex items-center gap-3 px-8 py-4 bg-[#1A1A1A] text-white rounded-full hover:bg-[#333] transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                   {isGeneratingAudio ? (
                     <Loader2 className="w-4 h-4 animate-spin text-white" />
                   ) : isReading ? (
                     <div className="w-4 h-4 rounded-sm bg-white animate-pulse" />
                   ) : (
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white group-hover:fill-white/20 transition-all"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                   )}
                  <span className="text-xs uppercase tracking-widest font-bold">
                    {isGeneratingAudio ? "Preparing..." : isReading ? "Pause Reading" : "Read Aloud"}
                  </span>
                </button>
                
                <div className="hidden sm:block h-8 w-[1px] bg-[#EEEAE3]"></div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase tracking-widest text-[#9A948C] font-bold">Voice Model</span>
                  <span className="text-[11px] font-medium text-[#4A4540]">Kore — Expressive / Clear</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8 opacity-30 select-none">
              <div className="w-12 h-[1px] bg-[#1A1A1A]"></div>
              <div className="space-y-6 pb-12">
                <p className="text-xl md:text-[28px] leading-[1.6] md:leading-[1.4] font-serif text-[#2D2A26]">
                  Awaiting the spark. Give the studio a visual prompt to begin drafting the opening lines.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Details */}
      <footer className="mt-8 md:mt-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-[10px] tracking-widest text-[#9A948C] uppercase pt-8 border-t border-[#EEEAE3]">
        <div className="flex gap-4 sm:gap-12">
          <p>Draft 04 / World: 01</p>
          <p>Tokens: {story ? story.split(' ').length : 0}</p>
        </div>
        <div className="flex gap-6">
          <span className="text-[#1A1A1A] cursor-pointer hidden sm:inline">Export as Manuscript</span>
          <span className="cursor-pointer hover:text-[#1A1A1A] transition-colors">Share Concept</span>
        </div>
      </footer>
    </div>
  );
}
