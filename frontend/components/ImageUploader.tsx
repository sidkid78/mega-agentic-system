"use client"

import { useState, useRef, ChangeEvent, DragEvent } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Upload, Image as ImageIcon } from "lucide-react"

interface ImageUploaderProps {
    onImageSelect: (base64: string) => void
    currentImage?: string
    label?: string
}

export function ImageUploader({ onImageSelect, currentImage, label = "Upload Image" }: ImageUploaderProps) {
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFile = (file: File) => {
        // Validate file type
        if (!file.type.startsWith("image/")) {
            alert("Please upload an image file")
            return
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert("Image size should be less than 10MB")
            return
        }

        // Convert to base64
        const reader = new FileReader()
        reader.onload = (e) => {
            const base64 = e.target?.result as string
            onImageSelect(base64)
        }
        reader.readAsDataURL(file)
    }

    const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            handleFile(file)
        }
    }

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files?.[0]
        if (file) {
            handleFile(file)
        }
    }

    const handleRemove = () => {
        onImageSelect("")
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium">{label}</label>

            {currentImage ? (
                <Card className="relative group overflow-hidden">
                    <img
                        src={currentImage}
                        alt="Uploaded"
                        className="w-full h-auto rounded-lg"
                    />
                    <div className="absolute top-2 right-2">
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleRemove}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </Card>
            ) : (
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-colors duration-200
            ${isDragging
                            ? "border-indigo-500 bg-indigo-500/10"
                            : "border-zinc-300 dark:border-zinc-700 hover:border-indigo-400"
                        }
          `}
                >
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center">
                            {isDragging ? (
                                <Upload className="h-6 w-6 text-indigo-500" />
                            ) : (
                                <ImageIcon className="h-6 w-6 text-indigo-500" />
                            )}
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                {isDragging ? "Drop your image here" : "Click to upload or drag and drop"}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                PNG, JPG, WEBP up to 10MB
                            </p>
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileInput}
                        className="hidden"
                    />
                </div>
            )}
        </div>
    )
}
