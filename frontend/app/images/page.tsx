"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiClient } from "@/lib/api"
import { apiKeyHeader } from "@/lib/api-key"
import { Loader2, Image as ImageIcon, Download } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { ImageUploader } from "@/components/ImageUploader"

export default function ImagesPage() {
  // Generate Tab State
  const [prompt, setPrompt] = useState("")
  const [aspectRatio, setAspectRatio] = useState("1:1")
  const [model, setModel] = useState("imagen-4.0-fast-generate-001")
  const [numberOfImages, setNumberOfImages] = useState(1)
  const [negativePrompt, setNegativePrompt] = useState("")

  // Edit Tab State
  const [editImage, setEditImage] = useState("")
  const [editPrompt, setEditPrompt] = useState("")
  const [editVariations, setEditVariations] = useState(1)

  // Reference Tab State
  const [referenceImage, setReferenceImage] = useState("")
  const [referencePrompt, setReferencePrompt] = useState("")
  const [referenceAspectRatio, setReferenceAspectRatio] = useState("1:1")
  const [referenceCount, setReferenceCount] = useState(1)

  // Batch Tab State
  const [batchPrompts, setBatchPrompts] = useState("")
  const [batchAspectRatio, setBatchAspectRatio] = useState("1:1")
  const [batchModel, setBatchModel] = useState("imagen-4.0-fast-generate-001")
  const [batchImagesPerPrompt, setBatchImagesPerPrompt] = useState(1)

  // Common State
  const [loading, setLoading] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<Array<{ index: number; data: string; format: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("generate")

  // ── Nano Banana (Gemini 3 native image gen) state ──────────────────────
  const [nbMode, setNbMode] = useState<"generate" | "edit" | "reference">("generate")
  const [nbModel, setNbModel] = useState("gemini-3.1-flash-image-preview")
  const [nbPrompt, setNbPrompt] = useState("")
  const [nbAspectRatio, setNbAspectRatio] = useState("1:1")
  const [nbImageSize, setNbImageSize] = useState("1K")
  const [nbSearchGrounding, setNbSearchGrounding] = useState(false)
  const [nbThinkingLevel, setNbThinkingLevel] = useState("minimal")
  const [nbIncludeText, setNbIncludeText] = useState(false)
  const [nbEditImage, setNbEditImage] = useState("")
  const [nbRefImages, setNbRefImages] = useState<string[]>(["", "", "", "", ""])
  const [nbLoading, setNbLoading] = useState(false)
  const [nbImages, setNbImages] = useState<Array<{ base64: string; mimeType: string }>>([])
  const [nbText, setNbText] = useState("")
  const [nbError, setNbError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setLoading(true)
    setError(null)
    setGeneratedImages([])

    try {
      const result = await apiClient.generateImage({
        prompt,
        aspect_ratio: aspectRatio,
        model,
        number_of_images: numberOfImages,
        negative_prompt: negativePrompt || undefined,
      })

      setGeneratedImages(result.images)
    } catch (err: any) {
      setError(err.message || "Failed to generate images")
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!editImage || !editPrompt.trim()) return

    setLoading(true)
    setError(null)
    setGeneratedImages([])

    try {
      const result = await apiClient.editImage({
        image_base64: editImage,
        prompt: editPrompt,
        number_of_images: editVariations,
      })

      setGeneratedImages(result.images)
    } catch (err: any) {
      setError(err.message || "Failed to edit image")
    } finally {
      setLoading(false)
    }
  }

  const handleReferenceGenerate = async () => {
    if (!referenceImage || !referencePrompt.trim()) return

    setLoading(true)
    setError(null)
    setGeneratedImages([])

    try {
      const result = await apiClient.generateWithReference({
        prompt: referencePrompt,
        reference_image_base64: referenceImage,
        aspect_ratio: referenceAspectRatio,
        number_of_images: referenceCount,
      })

      setGeneratedImages(result.images)
    } catch (err: any) {
      setError(err.message || "Failed to generate with reference")
    } finally {
      setLoading(false)
    }
  }

  const handleBatchGenerate = async () => {
    const prompts = batchPrompts.split("\n").filter(p => p.trim())
    if (prompts.length === 0) return

    setLoading(true)
    setError(null)
    setGeneratedImages([])

    try {
      const result = await apiClient.batchGenerateImages({
        prompts,
        aspect_ratio: batchAspectRatio,
        model: batchModel,
        number_of_images: batchImagesPerPrompt,
      })

      // Flatten all batch results into a single array
      const allImages = result.results.flatMap((r, promptIndex) =>
        r.images.map((img, imgIndex) => ({
          ...img,
          index: promptIndex * batchImagesPerPrompt + imgIndex
        }))
      )
      setGeneratedImages(allImages)
    } catch (err: any) {
      setError(err.message || "Failed to batch generate images")
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = (imageData: string, index: number) => {
    const link = document.createElement("a")
    link.href = imageData
    link.download = `generated-image-${index + 1}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Nano Banana helpers ────────────────────────────────────────────────
  const stripDataUrl = (s: string) => (s.includes(",") ? s.split(",")[1] : s)

  const nbAspectRatioList =
    nbModel === "gemini-3.1-flash-image-preview"
      ? ["1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"]
      : ["1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"]

  const nbImageSizeList =
    nbModel === "gemini-3.1-flash-image-preview"
      ? ["512","1K","2K","4K"]
      : nbModel === "gemini-3-pro-image-preview"
      ? ["1K","2K","4K"]
      : null // gemini-2.5 has no imageSize option

  const handleNanoBanana = async () => {
    if (!nbPrompt.trim()) return
    setNbLoading(true)
    setNbError(null)
    setNbImages([])
    setNbText("")

    try {
      const imgs: Array<{ base64: string; mimeType: string }> = []
      if (nbMode === "edit" && nbEditImage) {
        imgs.push({ base64: stripDataUrl(nbEditImage), mimeType: "image/png" })
      } else if (nbMode === "reference") {
        for (const img of nbRefImages) {
          if (img) imgs.push({ base64: stripDataUrl(img), mimeType: "image/png" })
        }
      }

      const isGemini25 = nbModel.startsWith("gemini-2.5")
      const res = await fetch("/api/images/nano-banana", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify({
          prompt: nbPrompt,
          model: nbModel,
          images: imgs,
          aspectRatio: nbAspectRatio,
          imageSize: isGemini25 ? undefined : nbImageSize,
          useSearchGrounding: nbSearchGrounding,
          thinkingLevel:
            nbModel === "gemini-3.1-flash-image-preview" ? nbThinkingLevel : undefined,
          includeText: nbIncludeText,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Generation failed")
      setNbImages(data.images ?? [])
      setNbText(data.text ?? "")
    } catch (err: unknown) {
      setNbError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setNbLoading(false)
    }
  }

  const handleNbDownload = (base64: string, mimeType: string, idx: number) => {
    const link = document.createElement("a")
    link.href = `data:${mimeType};base64,${base64}`
    link.download = `nano-banana-${idx + 1}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background */}
      <div className="mega-bg fixed inset-0" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              🎨 Image Generation
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              Generate, edit, and create stunning images with AI
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="reference">Reference</TabsTrigger>
            <TabsTrigger value="batch">Batch</TabsTrigger>
            <TabsTrigger value="nano-banana">🍌 Nano Banana</TabsTrigger>
          </TabsList>

          {/* Generate Tab */}
          <TabsContent value="generate" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Generation Settings</CardTitle>
                  <CardDescription>Configure your image generation parameters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="prompt" className="text-sm font-medium">
                      Prompt *
                    </label>
                    <Textarea
                      id="prompt"
                      placeholder="Describe the image you want to generate..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="negative-prompt" className="text-sm font-medium">
                      Negative Prompt (Optional)
                    </label>
                    <Textarea
                      id="negative-prompt"
                      placeholder="Things to avoid in the image..."
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="aspect-ratio" className="text-sm font-medium">
                        Aspect Ratio
                      </label>
                      <Select value={aspectRatio} onValueChange={setAspectRatio}>
                        <SelectTrigger id="aspect-ratio">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1:1">1:1 (Square)</SelectItem>
                          <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                          <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                          <SelectItem value="9:16">9:16 (Tall)</SelectItem>
                          <SelectItem value="16:9">16:9 (Wide)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="model" className="text-sm font-medium">
                        Model
                      </label>
                      <Select value={model} onValueChange={setModel}>
                        <SelectTrigger id="model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="imagen-4.0-fast-generate-001">Fast (Recommended)</SelectItem>
                          <SelectItem value="imagen-4.0-generate-001">Standard</SelectItem>
                          <SelectItem value="imagen-4.0-ultra-generate-001">Ultra (1 image only)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="number-of-images" className="text-sm font-medium">
                      Number of Images (1-4)
                    </label>
                    <Input
                      id="number-of-images"
                      type="number"
                      min="1"
                      max={model === "imagen-4.0-ultra-generate-001" ? "1" : "4"}
                      value={numberOfImages}
                      onChange={(e) => setNumberOfImages(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={loading || !prompt.trim()}
                    className="w-full pulse-glow"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Generate Images
                      </>
                    )}
                  </Button>

                  {error && (
                    <div className="rounded-lg bg-red-500/20 border border-red-500/30 dark:border-red-500/20 p-4">
                      <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Generated Images</CardTitle>
                  <CardDescription>
                    {generatedImages.length > 0
                      ? `${generatedImages.length} image(s) generated`
                      : "Images will appear here"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedImages.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-linear-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
                        <ImageIcon className="h-8 w-8 text-indigo-500" />
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        No images generated yet. Enter a prompt and click generate!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {generatedImages.map((img) => (
                        <div
                          key={img.index}
                          className="relative rounded-lg overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.data}
                            alt={`Generated image ${img.index + 1}`}
                            className="w-full h-auto"
                          />
                          <div className="absolute top-2 right-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDownload(img.data, img.index)}
                              className="glass-card"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Edit Tab */}
          <TabsContent value="edit" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Edit Image</CardTitle>
                  <CardDescription>Upload an image and describe how to edit it</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ImageUploader
                    onImageSelect={setEditImage}
                    currentImage={editImage}
                    label="Source Image *"
                  />

                  <div className="space-y-2">
                    <label htmlFor="edit-prompt" className="text-sm font-medium">
                      Edit Instructions *
                    </label>
                    <Textarea
                      id="edit-prompt"
                      placeholder="Describe how to modify the image..."
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="edit-variations" className="text-sm font-medium">
                      Number of Variations (1-4)
                    </label>
                    <Input
                      id="edit-variations"
                      type="number"
                      min="1"
                      max="4"
                      value={editVariations}
                      onChange={(e) => setEditVariations(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <Button
                    onClick={handleEdit}
                    disabled={loading || !editImage || !editPrompt.trim()}
                    className="w-full pulse-glow"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Editing...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Edit Image
                      </>
                    )}
                  </Button>

                  {error && (
                    <div className="rounded-lg bg-red-500/20 border border-red-500/30 dark:border-red-500/20 p-4">
                      <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Edited Images</CardTitle>
                  <CardDescription>
                    {generatedImages.length > 0
                      ? `${generatedImages.length} variation(s) created`
                      : "Edited images will appear here"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedImages.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
                        <ImageIcon className="h-8 w-8 text-indigo-500" />
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Upload an image and provide edit instructions!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {generatedImages.map((img) => (
                        <div
                          key={img.index}
                          className="relative rounded-lg overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.data}
                            alt={`Edited image ${img.index + 1}`}
                            className="w-full h-auto"
                          />
                          <div className="absolute top-2 right-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDownload(img.data, img.index)}
                              className="glass-card"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Reference Tab */}
          <TabsContent value="reference" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Generate with Reference</CardTitle>
                  <CardDescription>Use a reference image for style guidance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ImageUploader
                    onImageSelect={setReferenceImage}
                    currentImage={referenceImage}
                    label="Reference Image *"
                  />

                  <div className="space-y-2">
                    <label htmlFor="reference-prompt" className="text-sm font-medium">
                      Generation Prompt *
                    </label>
                    <Textarea
                      id="reference-prompt"
                      placeholder="Describe what to generate..."
                      value={referencePrompt}
                      onChange={(e) => setReferencePrompt(e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="reference-aspect" className="text-sm font-medium">
                        Aspect Ratio
                      </label>
                      <Select value={referenceAspectRatio} onValueChange={setReferenceAspectRatio}>
                        <SelectTrigger id="reference-aspect">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1:1">1:1 (Square)</SelectItem>
                          <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                          <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                          <SelectItem value="9:16">9:16 (Tall)</SelectItem>
                          <SelectItem value="16:9">16:9 (Wide)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="reference-count" className="text-sm font-medium">
                        Number of Images (1-4)
                      </label>
                      <Input
                        id="reference-count"
                        type="number"
                        min="1"
                        max="4"
                        value={referenceCount}
                        onChange={(e) => setReferenceCount(parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleReferenceGenerate}
                    disabled={loading || !referenceImage || !referencePrompt.trim()}
                    className="w-full pulse-glow"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Generate with Style
                      </>
                    )}
                  </Button>

                  {error && (
                    <div className="rounded-lg bg-red-500/20 border border-red-500/30 dark:border-red-500/20 p-4">
                      <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Generated Images</CardTitle>
                  <CardDescription>
                    {generatedImages.length > 0
                      ? `${generatedImages.length} image(s) with reference style`
                      : "Images will appear here"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedImages.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
                        <ImageIcon className="h-8 w-8 text-indigo-500" />
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Upload a reference image and provide a prompt!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {generatedImages.map((img) => (
                        <div
                          key={img.index}
                          className="relative rounded-lg overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.data}
                            alt={`Generated with reference ${img.index + 1}`}
                            className="w-full h-auto"
                          />
                          <div className="absolute top-2 right-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDownload(img.data, img.index)}
                              className="glass-card"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Batch Tab */}
          <TabsContent value="batch" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Batch Generate</CardTitle>
                  <CardDescription>Generate images for multiple prompts at once</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="batch-prompts" className="text-sm font-medium">
                      Prompts (one per line) *
                    </label>
                    <Textarea
                      id="batch-prompts"
                      placeholder={"A red apple\nA blue ocean\nA green forest"}
                      value={batchPrompts}
                      onChange={(e) => setBatchPrompts(e.target.value)}
                      rows={6}
                      className="resize-none font-mono text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="batch-aspect" className="text-sm font-medium">
                        Aspect Ratio
                      </label>
                      <Select value={batchAspectRatio} onValueChange={setBatchAspectRatio}>
                        <SelectTrigger id="batch-aspect">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1:1">1:1 (Square)</SelectItem>
                          <SelectItem value="3:4">3:4 (Portrait)</SelectItem>
                          <SelectItem value="4:3">4:3 (Landscape)</SelectItem>
                          <SelectItem value="9:16">9:16 (Tall)</SelectItem>
                          <SelectItem value="16:9">16:9 (Wide)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="batch-model" className="text-sm font-medium">
                        Model
                      </label>
                      <Select value={batchModel} onValueChange={setBatchModel}>
                        <SelectTrigger id="batch-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="imagen-4.0-fast-generate-001">Fast (Recommended)</SelectItem>
                          <SelectItem value="imagen-4.0-generate-001">Standard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="batch-per-prompt" className="text-sm font-medium">
                      Images per Prompt (1-4)
                    </label>
                    <Input
                      id="batch-per-prompt"
                      type="number"
                      min="1"
                      max="4"
                      value={batchImagesPerPrompt}
                      onChange={(e) => setBatchImagesPerPrompt(parseInt(e.target.value) || 1)}
                    />
                  </div>

                  <Button
                    onClick={handleBatchGenerate}
                    disabled={loading || !batchPrompts.trim()}
                    className="w-full pulse-glow"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Batch Generate
                      </>
                    )}
                  </Button>

                  {error && (
                    <div className="rounded-lg bg-red-500/20 border border-red-500/30 dark:border-red-500/20 p-4">
                      <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Batch Results</CardTitle>
                  <CardDescription>
                    {generatedImages.length > 0
                      ? `${generatedImages.length} image(s) generated`
                      : "Images will appear here"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedImages.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
                        <ImageIcon className="h-8 w-8 text-indigo-500" />
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Enter multiple prompts (one per line) to batch generate!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {generatedImages.map((img) => (
                        <div
                          key={img.index}
                          className="relative rounded-lg overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.data}
                            alt={`Batch generated ${img.index + 1}`}
                            className="w-full h-auto"
                          />
                          <div className="absolute top-2 right-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDownload(img.data, img.index)}
                              className="glass-card"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Nano Banana Tab ── */}
          <TabsContent value="nano-banana" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* ── Left: Controls ── */}
              <Card>
                <CardHeader>
                  <CardTitle>Nano Banana — Gemini 3 Image Generation</CardTitle>
                  <CardDescription>
                    Native Gemini image generation with thinking, grounding, and up to 4K output
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* Mode */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mode</label>
                    <div className="flex gap-2 flex-wrap">
                      {(["generate", "edit", "reference"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setNbMode(m)}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                            nbMode === m
                              ? "bg-indigo-500 border-indigo-500 text-white"
                              : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400"
                          }`}
                        >
                          {m === "generate" ? "✨ Generate" : m === "edit" ? "✏️ Edit Image" : "🖼️ Multi-Reference"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Model */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Model</label>
                    <Select value={nbModel} onValueChange={(v) => { setNbModel(v); setNbAspectRatio("1:1"); setNbImageSize("1K") }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini-3.1-flash-image-preview">
                          Nano Banana 2 — Gemini 3.1 Flash Image (Recommended)
                        </SelectItem>
                        <SelectItem value="gemini-3-pro-image-preview">
                          Nano Banana Pro — Gemini 3 Pro Image (Professional)
                        </SelectItem>
                        <SelectItem value="gemini-2.5-flash-image">
                          Nano Banana — Gemini 2.5 Flash Image (Fast)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Edit image upload */}
                  {nbMode === "edit" && (
                    <ImageUploader
                      onImageSelect={setNbEditImage}
                      currentImage={nbEditImage}
                      label="Source Image *"
                    />
                  )}

                  {/* Reference images */}
                  {nbMode === "reference" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Reference Images (up to {nbModel === "gemini-3.1-flash-image-preview" ? "10 objects + 4 characters" : "5 characters + 6 objects"})
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {nbRefImages.map((img, idx) => (
                          <div key={idx} className="space-y-1">
                            <ImageUploader
                              onImageSelect={(v) => setNbRefImages((prev) => { const next = [...prev]; next[idx] = v; return next })}
                              currentImage={img}
                              label={`Ref ${idx + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prompt */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      {nbMode === "edit" ? "Edit Instructions *" : nbMode === "reference" ? "Scene Prompt *" : "Prompt *"}
                    </label>
                    <Textarea
                      placeholder={
                        nbMode === "edit"
                          ? "Describe the changes to make to the image…"
                          : nbMode === "reference"
                          ? "Describe a scene using the reference subjects…"
                          : "Describe the image you want to create…"
                      }
                      value={nbPrompt}
                      onChange={(e) => setNbPrompt(e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                  </div>

                  {/* Aspect Ratio + Image Size */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Aspect Ratio</label>
                      <Select value={nbAspectRatio} onValueChange={setNbAspectRatio}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {nbAspectRatioList.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {nbImageSizeList ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Resolution</label>
                        <Select value={nbImageSize} onValueChange={setNbImageSize}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {nbImageSizeList.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Resolution</label>
                        <div className="flex h-10 items-center rounded-md border border-zinc-200 dark:border-zinc-800 px-3 text-sm text-zinc-500">
                          1K (fixed for 2.5 Flash)
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Thinking level (3.1 Flash only) */}
                  {nbModel === "gemini-3.1-flash-image-preview" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Thinking Level</label>
                      <Select value={nbThinkingLevel} onValueChange={setNbThinkingLevel}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minimal">Minimal (fastest)</SelectItem>
                          <SelectItem value="high">High (best quality)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Thinking tokens are billed regardless of visibility
                      </p>
                    </div>
                  )}

                  {/* Toggles */}
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={nbSearchGrounding}
                        onChange={(e) => setNbSearchGrounding(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Google Search Grounding</span>
                        <span className="text-zinc-500 dark:text-zinc-400 ml-1">
                          — generate from real-time data (news, weather, etc.)
                        </span>
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={nbIncludeText}
                        onChange={(e) => setNbIncludeText(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Include text response</span>
                        <span className="text-zinc-500 dark:text-zinc-400 ml-1">
                          — show the model's description alongside the image
                        </span>
                      </span>
                    </label>
                  </div>

                  <Button
                    onClick={handleNanoBanana}
                    disabled={
                      nbLoading ||
                      !nbPrompt.trim() ||
                      (nbMode === "edit" && !nbEditImage)
                    }
                    className="w-full pulse-glow"
                  >
                    {nbLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Generate with Nano Banana
                      </>
                    )}
                  </Button>

                  {nbError && (
                    <div className="rounded-lg bg-red-500/20 border border-red-500/30 dark:border-red-500/20 p-4">
                      <p className="text-sm text-red-900 dark:text-red-100">{nbError}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Right: Output ── */}
              <Card>
                <CardHeader>
                  <CardTitle>Generated Image</CardTitle>
                  <CardDescription>
                    {nbImages.length > 0 ? "Image generated — SynthID watermarked" : "Image will appear here"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {nbImages.length === 0 && !nbLoading && (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-linear-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
                        <ImageIcon className="h-8 w-8 text-indigo-500" />
                      </div>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Enter a prompt and click Generate
                      </p>
                    </div>
                  )}

                  {nbLoading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {nbThinkingLevel === "high" && nbModel === "gemini-3.1-flash-image-preview"
                          ? "Thinking deeply… this may take a moment"
                          : "Generating…"}
                      </p>
                    </div>
                  )}

                  {nbImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-lg overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:${img.mimeType};base64,${img.base64}`}
                        alt={`Nano Banana output ${idx + 1}`}
                        className="w-full h-auto"
                      />
                      <div className="absolute top-2 right-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleNbDownload(img.base64, img.mimeType, idx)}
                          className="glass-card"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {nbText && (
                    <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-4 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                      {nbText}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Info bar */}
            <div className="rounded-xl glass-card border border-zinc-200/50 dark:border-zinc-800/50 p-5">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Model Comparison</h3>
              <div className="grid grid-cols-3 gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                <div>
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">🍌 Nano Banana 2 (3.1 Flash)</p>
                  <p>Up to 4K · 14 ref images · Search + Image Search grounding · Thinking</p>
                </div>
                <div>
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">🍌 Nano Banana Pro (3 Pro)</p>
                  <p>Up to 4K · 14 ref images · Search grounding · Professional assets</p>
                </div>
                <div>
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">🍌 Nano Banana (2.5 Flash)</p>
                  <p>1K fixed · 3 ref images · Fast &amp; cost-efficient</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
