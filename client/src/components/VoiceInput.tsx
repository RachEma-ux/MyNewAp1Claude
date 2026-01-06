/**
 * Voice Input Component
 * Speech-to-text and text-to-speech functionality
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VoiceInputProps {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function VoiceInput({ onTranscript, onError, className }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check if browser supports speech recognition
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      console.warn("Speech recognition not supported");
      return;
    }

    // Initialize speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      const fullTranscript = finalTranscript || interimTranscript;
      setTranscript(fullTranscript);

      if (finalTranscript && onTranscript) {
        onTranscript(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      
      const errorMessage = getErrorMessage(event.error);
      toast.error(errorMessage);
      
      if (onError) {
        onError(errorMessage);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onTranscript, onError]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition not supported in this browser");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript("");
      recognitionRef.current.start();
      setIsListening(true);
      toast.success("Listening...");
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant={isListening ? "destructive" : "outline"}
        size="icon"
        onClick={toggleListening}
        className={cn(isListening && "animate-pulse")}
      >
        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
      {transcript && (
        <span className="text-sm text-muted-foreground">{transcript}</span>
      )}
    </div>
  );
}

function getErrorMessage(error: string): string {
  switch (error) {
    case "no-speech":
      return "No speech detected. Please try again.";
    case "audio-capture":
      return "No microphone found. Please check your device.";
    case "not-allowed":
      return "Microphone permission denied. Please allow access.";
    case "network":
      return "Network error. Please check your connection.";
    default:
      return "Speech recognition error. Please try again.";
  }
}

/**
 * Text-to-Speech Component
 */

interface TextToSpeechProps {
  text?: string;
  autoPlay?: boolean;
  className?: string;
}

export function TextToSpeech({ text, autoPlay = false, className }: TextToSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (autoPlay && text) {
      speak(text);
    }
  }, [text, autoPlay]);

  const speak = (textToSpeak: string) => {
    if (!("speechSynthesis" in window)) {
      toast.error("Text-to-speech not supported in this browser");
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      setIsSpeaking(false);
      setIsPaused(false);
      toast.error("Failed to speak text");
    };

    window.speechSynthesis.speak(utterance);
  };

  const toggleSpeech = () => {
    if (!text) {
      toast.error("No text to speak");
      return;
    }

    if (isSpeaking) {
      if (isPaused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      } else {
        window.speechSynthesis.pause();
        setIsPaused(true);
      }
    } else {
      speak(text);
    }
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        size="icon"
        onClick={toggleSpeech}
        disabled={!text}
      >
        {isSpeaking ? (
          isPaused ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>
      {isSpeaking && (
        <Button variant="ghost" size="icon" onClick={stopSpeech}>
          <VolumeX className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
