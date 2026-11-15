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
import {
  IMAGE_MODEL_OPTIONS,
  MAX_REFERENCE_IMAGES,
  NANO_BANANA_MODEL,
  NANO_BANANA_PRO_MODEL,
  imageAspectRatios,
  imageSizes,
  supportsImageSearch,
  supportsSearchGrounding,
  supportsThinkingLevel,
  supportsVideoInput,
} from "@/lib/image-models"
import type { ImageBlock, OutputBlock } from "@/lib/image-models"
import { Loader2, Image as ImageIcon, Download } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { ImageUploader } from "@/components/ImageUploader"

export default function ImagesPage() {
  // Generate Tab State
  const [prompt, setPrompt] = useState("")
  const [aspectRatio, setAspectRatio] = useState("1:1")
  const [model, setModel] = useState<string>(NANO_BANANA_MODEL)
  const [numberOfImages, setNumberOfImages] = useState(1)
  const [imageSize, setImageSize] = useState("1K")
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
  const [batchModel, setBatchModel] = useState<string>(NANO_BANANA_MODEL)
  const [batchImagesPerPrompt, setBatchImagesPerPrompt] = useState(1)
  const [batchImageSize, setBatchImageSize] = useState("1K")

  // Common State
  const [loading, setLoading] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<Array<{ index: number; data: string; format: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("generate")

  // ── Nano Banana (advanced controls) state ──────────────────────
  const [nbMode, setNbMode] = useState<"generate" | "edit" | "reference" | "video">("generate")
  const [nbModel, setNbModel] = useState<string>(NANO_BANANA_MODEL)
  const [nbPrompt, setNbPrompt] = useState("")
  const [nbAspectRatio, setNbAspectRatio] = useState("1:1")
  const [nbImageSize, setNbImageSize] = useState("1K")
  const [nbSearchGrounding, setNbSearchGrounding] = useState(false)
  const [nbThinkingLevel, setNbThinkingLevel] = useState("minimal")
  const [nbIncludeText, setNbIncludeText] = useState(false)
  const [nbEditImage, setNbEditImage] = useState("")
  const [nbRefImages, setNbRefImages] = useState<string[]>([])
  const [nbLoading, setNbLoading] = useState(false)
  const [nbVideoUrl, setNbVideoUrl] = useState("")
  const [nbImageSearch, setNbImageSearch] = useState(false)
  // Output blocks keep the model's order, so Pro's interleaved text and images read as written.
  const [nbBlocks, setNbBlocks] = useState<OutputBlock[]>([])
  const [nbSuggestions, setNbSuggestions] = useState<string[]>([])
  // Multi-turn editing: the interaction to continue from, and how many turns deep we are.
  const [nbInteractionId, setNbInteractionId] = useState<string | null>(null)
  const [nbChainable, setNbChainable] = useState(true)
  const [nbTurn, setNbTurn] = useState(0)
  const [nbRefinePrompt, setNbRefinePrompt] = useState("")
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
        image_size: imageSize,
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
        image_size: batchImageSize,
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
  /** Split an uploader data URL into the raw base64 and its real MIME type. */
  const toInputImage = (dataUrl: string) => {
    const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl)
    return match
      ? { base64: match[2], mimeType: match[1] }
      : { base64: dataUrl, mimeType: "image/png" }
  }

  const nbAspectRatioList = imageAspectRatios(nbModel)
  const nbImageSizeList = imageSizes(nbModel)
  const nbHasThinkingLevel = supportsThinkingLevel(nbModel)
  const nbHasSearchGrounding = supportsSearchGrounding(nbModel)
  const nbHasImageSearch = supportsImageSearch(nbModel)
  const nbHasVideoInput = supportsVideoInput(nbModel)
  const nbImages = nbBlocks.filter((b): b is ImageBlock => b.type === "image")
  const nbLastImage = nbImages[nbImages.length - 1]

  const handleNbReset = () => {
    setNbBlocks([])
    setNbSuggestions([])
    setNbInteractionId(null)
    setNbChainable(true)
    setNbTurn(0)
    setNbRefinePrompt("")
    setNbError(null)
  }

  /** Runs a fresh generation, or (isRefine) the next turn on the current result. */
  const runNanoBanana = async (isRefine: boolean) => {
    const promptText = isRefine ? nbRefinePrompt : nbPrompt
    if (!promptText.trim()) return
    setNbLoading(true)
    setNbError(null)
    if (!isRefine) handleNbReset()

    try {
      const imgs: Array<{ base64: string; mimeType: string }> = []
      let previousInteractionId: string | undefined
      if (isRefine) {
        // Continue the conversation by id so earlier turns stay in context. The API
        // refuses to chain onto a turn that ran Search, so that case resends the image.
        if (nbInteractionId && nbChainable) {
          previousInteractionId = nbInteractionId
        } else if (nbLastImage) {
          imgs.push({ base64: nbLastImage.base64, mimeType: nbLastImage.mimeType })
        }
      } else if (nbMode === "edit" && nbEditImage) {
        imgs.push(toInputImage(nbEditImage))
      } else if (nbMode === "reference") {
        for (const img of nbRefImages) imgs.push(toInputImage(img))
      }

      const res = await fetch("/api/images/nano-banana", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify({
          prompt: promptText,
          model: nbModel,
          images: imgs,
          videoUrl:
            !isRefine && nbMode === "video" && nbHasVideoInput ? nbVideoUrl.trim() : undefined,
          // A refine keeps the shape of the image it is editing.
          aspectRatio: isRefine ? undefined : nbAspectRatio,
          imageSize: nbImageSize,
          useSearchGrounding: nbHasSearchGrounding && nbSearchGrounding,
          useImageSearch: nbHasImageSearch && nbImageSearch,
          thinkingLevel: nbHasThinkingLevel ? nbThinkingLevel : undefined,
          includeText: nbIncludeText,
          previousInteractionId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Generation failed")
      setNbBlocks(data.blocks ?? [])
      setNbSuggestions(data.searchSuggestions ?? [])
      setNbInteractionId(data.interactionId ?? null)
      setNbChainable(!data.usedSearch)
      setNbTurn((turn) => (isRefine ? turn + 1 : 1))
      if (isRefine) setNbRefinePrompt("")
    } catch (err: unknown) {
      setNbError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setNbLoading(false)
    }
  }

  const handleNbDownload = (base64: string, mimeType: string, idx: number) => {
    const link = document.createElement("a")
    link.href = `data:${mimeType};base64,${base64}`
    link.download = `nano-banana-${idx + 1}.${mimeType === "image/jpeg" ? "jpg" : "png"}`
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
                          {imageAspectRatios(model).map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="model" className="text-sm font-medium">
                        Model
                      </label>
                      <Select value={model} onValueChange={(v) => { setModel(v); setAspectRatio("1:1"); setImageSize("1K") }}>
                        <SelectTrigger id="model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {IMAGE_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="image-size" className="text-sm font-medium">
                      Resolution
                    </label>
                    <Select value={imageSize} onValueChange={setImageSize}>
                      <SelectTrigger id="image-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imageSizes(model).map((size) => (
                          <SelectItem key={size} value={size}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="number-of-images" className="text-sm font-medium">
                      Number of Images (1-4)
                    </label>
                    <Input
                      id="number-of-images"
                      type="number"
                      min="1"
                      max="4"
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
                          {imageAspectRatios(batchModel).map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="batch-model" className="text-sm font-medium">
                        Model
                      </label>
                      <Select value={batchModel} onValueChange={(v) => { setBatchModel(v); setBatchAspectRatio("1:1"); setBatchImageSize("1K") }}>
                        <SelectTrigger id="batch-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {IMAGE_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="batch-image-size" className="text-sm font-medium">
                      Resolution
                    </label>
                    <Select value={batchImageSize} onValueChange={setBatchImageSize}>
                      <SelectTrigger id="batch-image-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imageSizes(batchModel).map((size) => (
                          <SelectItem key={size} value={size}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <CardTitle>Nano Banana — Advanced Image Generation</CardTitle>
                  <CardDescription>
                    Native Gemini image generation with thinking, grounding, and up to 4K output
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* Mode */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mode</label>
                    <div className="flex gap-2 flex-wrap">
                      {(["generate", "edit", "reference", "video"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setNbMode(m)}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                            nbMode === m
                              ? "bg-indigo-500 border-indigo-500 text-white"
                              : "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-400"
                          }`}
                        >
                          {m === "generate" ? "✨ Generate" : m === "edit" ? "✏️ Edit Image" : m === "reference" ? "🖼️ Multi-Reference" : "🎬 From Video"}
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
                        {IMAGE_MODEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
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
                        Reference Images ({nbRefImages.length}/{MAX_REFERENCE_IMAGES}: up to {nbModel === NANO_BANANA_PRO_MODEL ? "6 objects, 5 characters, 3 styles" : "10 objects, 4 characters"})
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {(nbRefImages.length < MAX_REFERENCE_IMAGES ? [...nbRefImages, ""] : nbRefImages).map((img, idx) => (
                          <div key={idx} className="space-y-1">
                            <ImageUploader
                              onImageSelect={(v) =>
                                setNbRefImages((prev) =>
                                  v
                                    ? [...prev.slice(0, idx), v, ...prev.slice(idx + 1)]
                                    : prev.filter((_, i) => i !== idx)
                                )
                              }
                              currentImage={img}
                              label={`Ref ${idx + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Video-to-image */}
                  {nbMode === "video" && (
                    <div className="space-y-2">
                      <label htmlFor="nb-video-url" className="text-sm font-medium">YouTube URL *</label>
                      <Input
                        id="nb-video-url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={nbVideoUrl}
                        onChange={(e) => setNbVideoUrl(e.target.value)}
                      />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {nbHasVideoInput
                          ? "The model watches the video and uses it as context. Try a poster, thumbnail or summary infographic."
                          : "Video input is not available on Nano Banana Pro."}
                      </p>
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
                  </div>

                  {/* Thinking level (not offered for Pro) */}
                  {nbHasThinkingLevel && (
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
                    <label className={`flex items-center gap-3 ${nbHasSearchGrounding ? "cursor-pointer" : "opacity-50"}`}>
                      <input
                        type="checkbox"
                        checked={nbHasSearchGrounding && nbSearchGrounding}
                        disabled={!nbHasSearchGrounding}
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
                    <label className={`flex items-center gap-3 ${nbHasImageSearch ? "cursor-pointer" : "opacity-50"}`}>
                      <input
                        type="checkbox"
                        checked={nbHasImageSearch && nbImageSearch}
                        disabled={!nbHasImageSearch}
                        onChange={(e) => setNbImageSearch(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Google Image Search</span>
                        <span className="text-zinc-500 dark:text-zinc-400 ml-1">
                          (Nano Banana 2.1) use real web images as visual reference
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
                    onClick={() => runNanoBanana(false)}
                    disabled={
                      nbLoading ||
                      !nbPrompt.trim() ||
                      (nbMode === "edit" && !nbEditImage) ||
                      (nbMode === "video" && (!nbVideoUrl.trim() || !nbHasVideoInput))
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
                        {nbThinkingLevel === "high" && nbHasThinkingLevel
                          ? "Thinking deeply… this may take a moment"
                          : "Generating…"}
                      </p>
                    </div>
                  )}

                  {nbBlocks.map((block, idx) =>
                    block.type === "text" ? (
                      <div
                        key={idx}
                        className="rounded-lg bg-zinc-100 dark:bg-zinc-800/50 p-4 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap"
                      >
                        {block.text}
                      </div>
                    ) : (
                      <div
                        key={idx}
                        className="relative rounded-lg overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`data:${block.mimeType};base64,${block.base64}`}
                          alt={`Nano Banana output ${idx + 1}`}
                          className="w-full h-auto"
                        />
                        <div className="absolute top-2 right-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleNbDownload(block.base64, block.mimeType, idx)}
                            className="glass-card"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  )}

                  {/* Google requires these to be shown when Search grounding was used.
                      They are Google-supplied HTML, so they render in a sandboxed frame. */}
                  {nbSuggestions.map((html, idx) => (
                    <iframe
                      key={idx}
                      title="Google Search suggestions"
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      srcDoc={html}
                      className="w-full h-14 rounded-lg border-0"
                    />
                  ))}

                  {/* Multi-turn editing */}
                  {nbLastImage && !nbLoading && (
                    <div className="space-y-2 rounded-lg border border-indigo-500/30 p-4">
                      <label htmlFor="nb-refine" className="text-sm font-medium">
                        Refine this result (turn {nbTurn})
                      </label>
                      <Textarea
                        id="nb-refine"
                        placeholder="Describe the next change, e.g. make it night, remove the boat, translate the text to Spanish"
                        value={nbRefinePrompt}
                        onChange={(e) => setNbRefinePrompt(e.target.value)}
                        rows={2}
                        className="resize-none"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => runNanoBanana(true)}
                          disabled={!nbRefinePrompt.trim()}
                          className="flex-1"
                        >
                          Apply change
                        </Button>
                        <Button variant="outline" onClick={handleNbReset}>
                          Start over
                        </Button>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {nbChainable
                          ? "Continues the same conversation, so earlier turns stay in context."
                          : "The last turn used Search, so this sends the image back instead of continuing the conversation."}
                      </p>
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
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">🍌 Nano Banana 2.1</p>
                  <p>Up to 4K · 14 ref images · Search + Image Search · Video input · Multi-turn editing</p>
                </div>
                <div>
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">🍌 Nano Banana Pro (3 Pro)</p>
                  <p>Up to 4K · 14 ref images · Search grounding · Interleaved text + images</p>
                </div>
                <div>
                  <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">🍌 Nano Banana 2 Lite</p>
                  <p>1K only · Video input · No Search · Fastest &amp; cheapest</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
