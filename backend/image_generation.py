from PIL import Image 
from io import BytesIO 
from google import genai
from google.genai import types
from typing import List, Optional, Literal


def generate_image(
    client: genai.Client, 
    prompt: str, 
    aspect_ratio: str = "1:1",
    model: str = "gemini-3.1-flash-image",
    number_of_images: int = 1,
    output_mime_type: str = "image/jpeg",
    person_generation: str = "ALLOW_ADULT",
    negative_prompt: Optional[str] = None,
) -> List[Image.Image]:
    """
    Generate images using Google's generative models (Gemini or Imagen).
    
    This function supports both the newer Gemini image models (via generate_content)
    and the dedicated Imagen 4.0 models (via generate_images).
    
    Args:
        client (genai.Client): An initialized Gemini API client
        prompt (str): A text description of the image to generate
        aspect_ratio (str, optional): The aspect ratio ("1:1", "3:4", "4:3", "9:16", "16:9")
        model (str, optional): The model to use. Options:
            - "gemini-3.5-flash-image" (Fast, high quality - Nano Banana)
            - "gemini-3-pro-image-preview" (Highest quality - Nano Banana Pro)
            - "imagen-4.0-fast-generate-001" (Legacy Imagen)
            - "imagen-4.0-ultra-generate-001" (Legacy Imagen Ultra)
            Defaults to "gemini-3.1-flash-image-preview".
        number_of_images (int, optional): Number of images to generate (1-4).
        output_mime_type (str, optional): "image/jpeg" or "image/png".
        person_generation (str, optional): "ALLOW_ADULT", "ALLOW_ALL", "DONT_ALLOW".
        negative_prompt (str, optional): Things to avoid in the generated image.
    
    Returns:
        List[Image.Image]: List of PIL Image objects
    """
    # Validate parameters
    valid_aspects = ["1:1", "3:4", "4:3", "9:16", "16:9"]
    if aspect_ratio not in valid_aspects:
        raise ValueError(f"aspect_ratio must be one of {valid_aspects}")
    
    if not 1 <= number_of_images <= 4:
        raise ValueError("number_of_images must be between 1 and 4")

    try:
        if model.startswith("gemini-"):
            # Gemini use candidate_count and a specific image_config
            config = {
                'response_modalities': ['IMAGE'],
                'candidate_count': number_of_images,
                'image_config': {
                    'aspect_ratio': aspect_ratio,
                    'output_mime_type': output_mime_type,
                }
            }
            # Note: person_generation might be handled differently or as a safety setting.
            # For now, we omit it if it causes validation errors in image_config.
            
            if negative_prompt:
                config['image_config']['negative_prompt'] = negative_prompt

            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config
            )
            
            images = []
            for candidate in response.candidates:
                for part in candidate.content.parts:
                    if part.inline_data:
                        images.append(Image.open(BytesIO(part.inline_data.data)))
            return images

        # Fallback to legacy Imagen pattern
        config = {
            'number_of_images': number_of_images,
            'aspect_ratio': aspect_ratio,
            'output_mime_type': output_mime_type,
            'person_generation': person_generation,
        }
        if negative_prompt:
            config['negative_prompt'] = negative_prompt
            
        result = client.models.generate_images(
            model=model,
            prompt=prompt,
            config=config
        )
        
        images = []
        for generated_image in result.generated_images:
            images.append(Image.open(BytesIO(generated_image.image.image_bytes)))
        return images
    
    except Exception as e:
        print(f"Error generating images: {e}")
        raise


def upscale_image(
    client: genai.Client,
    image: Image.Image,
    upscale_factor: Literal["x2", "x4"] = "x2",
    output_mime_type: str = "image/jpeg"
) -> Image.Image:
    """
    Upscale an image using Imagen's upscaling capability.
    
    Note: Only available in Vertex AI, not Gemini Developer API.
    
    Args:
        client (genai.Client): An initialized Gemini API client (must be Vertex AI)
        image (Image.Image): PIL Image to upscale
        upscale_factor (str): Upscale factor - "x2" or "x4". Defaults to "x2".
        output_mime_type (str): Output format. Defaults to "image/jpeg".
    
    Returns:
        Image.Image: Upscaled PIL Image
    
    Example:
        >>> original = generate_image(client, "A cat")[0]
        >>> upscaled = upscale_image(client, original, upscale_factor="x4")
        >>> upscaled.save("upscaled_cat.png")
    """
    result = client.models.upscale_image(
        model='imagen-4.0-generate-001',
        image=image,
        upscale_factor=upscale_factor,
        config=types.UpscaleImageConfig(
            include_rai_reason=True,
            output_mime_type=output_mime_type,
        ),
    )
    
    image_bytes = result.generated_images[0].image.image_bytes
    return Image.open(BytesIO(image_bytes))


def edit_image_with_gemini(
    client: genai.Client,
    image: Image.Image,
    prompt: str,
    number_of_images: int = 1
) -> List[Image.Image]:
    """
    Edit an image using Gemini's native image generation model in chat mode.
    
    This uses gemini-3.1-flash-image-preview (Nano Banana 2) which can generate
    and edit images in a conversational context.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        image (Image.Image): PIL Image to edit
        prompt (str): Description of how to edit the image
        number_of_images (int): Number of variations to generate (1-4)
    
    Returns:
        List[Image.Image]: List of edited PIL Images
    """
    # Create a chat session for image editing using the latest model
    chat = client.chats.create(model="gemini-3.1-flash-image-preview")
    
    # Send the image and edit prompt
    response = chat.send_message([prompt, image])
    
    # Extract generated images from response
    generated_images = []
    for candidate in response.candidates:
        for part in candidate.content.parts:
            if part.inline_data:
                generated_images.append(Image.open(BytesIO(part.inline_data.data)))
    
    return generated_images


def generate_with_reference_image(
    client: genai.Client,
    prompt: str,
    reference_image: Image.Image,
    aspect_ratio: str = "1:1",
    number_of_images: int = 1
) -> List[Image.Image]:
    """
    Generate images using a reference image for style or content guidance.
    
    Uses Gemini's multimodal capabilities to analyze the reference image
    and generate new images based on the prompt and reference style.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        prompt (str): Text description of what to generate
        reference_image (Image.Image): Reference image for style/content guidance
        aspect_ratio (str): Aspect ratio for generated images
        number_of_images (int): Number of images to generate
    
    Returns:
        List[Image.Image]: List of generated PIL Images
    """
    # First, analyze the reference image using Gemini 3 Flash
    analysis_response = client.models.generate_content(
        model='gemini-3.5-flash',
        contents=[
            reference_image,
            "Describe the style, composition, color palette, and key visual elements of this image for image generation guidance."
        ]
    )
    
    # Enhance the prompt with the analysis
    style_description = analysis_response.text.strip()
    enhanced_prompt = f"{prompt}. Use the following style and composition: {style_description}"
    
    # Generate images with the enhanced prompt
    return generate_image(
        client=client,
        prompt=enhanced_prompt,
        aspect_ratio=aspect_ratio,
        number_of_images=number_of_images
    )


def batch_generate_images(
    client: genai.Client,
    prompts: List[str],
    **kwargs
) -> List[List[Image.Image]]:
    """
    Generate images for multiple prompts efficiently.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        prompts (List[str]): List of prompts to generate images for
        **kwargs: Additional arguments to pass to generate_image()
    
    Returns:
        List[List[Image.Image]]: List of image lists, one per prompt
    
    Example:
        >>> prompts = [
        ...     "A sunset over mountains",
        ...     "A busy city street at night",
        ...     "A peaceful forest scene"
        ... ]
        >>> results = batch_generate_images(client, prompts, number_of_images=2)
        >>> # results[0] contains 2 sunset images, results[1] contains 2 city images, etc.
    """
    results = []
    for prompt in prompts:
        try:
            images = generate_image(client, prompt, **kwargs)
            results.append(images)
        except Exception as e:
            print(f"Failed to generate images for prompt '{prompt}': {e}")
            results.append([])
    
    return results


# Usage Examples
if __name__ == "__main__":
    from main import create_client
    
    client = create_client()
    
    try:
        print("=" * 80)
        print("IMAGE GENERATION EXAMPLES")
        print("=" * 80)
        
        # Example 1: Basic image generation
        print("\n1. Generating a single image...")
        images = generate_image(client, "A futuristic AI research lab")
        images[0].save("basic_image.png")
        print(f"✓ Saved basic_image.png")
        
        # Example 2: Multiple images with different aspect ratio
        print("\n2. Generating multiple images with landscape aspect ratio...")
        images = generate_image(
            client,
            "A serene mountain landscape at sunset",
            aspect_ratio="16:9",
            number_of_images=3
        )
        for i, img in enumerate(images):
            img.save(f"landscape_{i}.png")
        print(f"✓ Saved {len(images)} landscape images")
        
        # Example 3: Using negative prompt
        print("\n3. Generating with negative prompt...")
        images = generate_image(
            client,
            "A beautiful garden",
            negative_prompt="people, buildings, artificial structures",
            number_of_images=1
        )
        images[0].save("garden_no_people.png")
        print(f"✓ Saved garden_no_people.png")
        
        # Example 4: High-quality generation
        print("\n4. Generating high-quality image...")
        images = generate_image(
            client,
            "An ultra-detailed photograph of a butterfly",
            model="imagen-4.0-generate-001",
            output_mime_type="image/png"
        )
        images[0].save("butterfly_hq.png")
        print(f"✓ Saved butterfly_hq.png")
        
        # Example 5: Batch generation
        print("\n5. Batch generating images...")
        prompts = [
            "A red apple on a table",
            "A blue ocean wave",
            "A green forest path"
        ]
        batch_results = batch_generate_images(client, prompts)
        for i, images in enumerate(batch_results):
            if images:
                images[0].save(f"batch_{i}.png")
        print(f"✓ Saved {len(batch_results)} batch images")
        
        # Example 6: Image editing (if available)
        print("\n6. Editing an image with Gemini...")
        try:
            original = images[0]  # Use image from previous step
            edited = edit_image_with_gemini(
                client,
                original,
                "Add a rainbow in the sky"
            )
            if edited:
                edited[0].save("edited_image.png")
                print(f"✓ Saved edited_image.png")
        except Exception as e:
            print(f"⚠ Image editing not available: {e}")
        
        # Example 7: Upscaling (Vertex AI only)
        print("\n7. Upscaling an image (Vertex AI only)...")
        try:
            upscaled = upscale_image(client, images[0], upscale_factor="x2")
            upscaled.save("upscaled_image.png")
            print(f"✓ Saved upscaled_image.png")
        except Exception as e:
            print(f"⚠ Upscaling not available: {e}")
        
        print("\n" + "=" * 80)
        print("All examples completed!")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        try:
            client.close()
        except Exception:
            pass



#     result = client.models.generate_images(
#         model="imagen-4.0-fast-generate-001",
#         prompt=prompt,
#         config={
#             'number_of_images': 1,
#             'aspect_ratio': aspect_ratio,
#             'person_generation': 'ALLOW_ADULT'
#         }
#     )

#     image_bytes = result.generated_images[0].image.image_bytes 
#     return Image.open(BytesIO(image_bytes))

# # Usage 
# if __name__ == "__main__":
#     from main import create_client
#     client = create_client()
#     try:
#         image = generate_image(client, "A futuristic AI research lab")
#         image.save("generated_image.png")
#     finally:
#         try:
#             client.close()
#         except Exception:
#             pass
