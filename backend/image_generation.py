"""
Image generation and editing with the Nano Banana models.

Everything here goes through the Interactions API (client.interactions.create),
which needs google-genai >= 2.0.0. Imagen was shut down on the Gemini API on
2026-08-17, so there is no generate_images path any more.
"""
import base64
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from typing import Any, Callable, Dict, List, Optional, Sequence

from PIL import Image
from google import genai


# Nano Banana 2.1 - the current workhorse for generation and editing.
DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1"
# Nano Banana Pro - slower, for complex instructions and high-fidelity text.
PRO_IMAGE_MODEL = "gemini-3-pro-image"
# Nano Banana 2 Lite - fastest and cheapest, 1K only; weak at multi-reference and multi-turn edits.
LITE_IMAGE_MODEL = "gemini-3.1-flash-lite-image"

# Nano Banana 2.1 takes all of these. Pro is not documented for the 1:4 / 4:1 / 1:8 / 8:1
# panoramas; the API rejects a ratio the chosen model does not support.
ASPECT_RATIOS = (
    "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4",
    "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1",
)
IMAGE_SIZES = ("1K", "2K", "4K")
MAX_IMAGES_PER_REQUEST = 4


def _image_part(image: Image.Image) -> Dict[str, str]:
    """Encode a PIL image as an Interactions API image input block."""
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return {
        "type": "image",
        "data": base64.b64encode(buffer.getvalue()).decode("utf-8"),
        "mime_type": "image/png",
    }


def _images_from_interaction(interaction: Any) -> List[Image.Image]:
    """Collect every image the model returned, in order."""
    images: List[Image.Image] = []
    for step in getattr(interaction, "steps", None) or []:
        if getattr(step, "type", None) != "model_output":
            continue
        for block in getattr(step, "content", None) or []:
            if getattr(block, "type", None) != "image" or not getattr(block, "data", None):
                continue
            image = Image.open(BytesIO(base64.b64decode(block.data)))
            # Callers save these as JPEG, which cannot hold an alpha channel.
            if image.mode != "RGB":
                image = image.convert("RGB")
            images.append(image)
    return images


def _validate(model: str, aspect_ratio: Optional[str], image_size: Optional[str], number_of_images: int) -> None:
    if model.startswith("imagen-"):
        raise ValueError(
            f"{model} was shut down on 2026-08-17. Use {DEFAULT_IMAGE_MODEL}, "
            f"{PRO_IMAGE_MODEL} or {LITE_IMAGE_MODEL} instead."
        )
    if aspect_ratio is not None and aspect_ratio not in ASPECT_RATIOS:
        raise ValueError(f"aspect_ratio must be one of {list(ASPECT_RATIOS)}")
    if image_size is not None and image_size not in IMAGE_SIZES:
        raise ValueError(f"image_size must be one of {list(IMAGE_SIZES)}")
    if model == LITE_IMAGE_MODEL and image_size not in (None, "1K"):
        # The API answers this with a bare 404 "Requested entity was not found".
        raise ValueError(f"{LITE_IMAGE_MODEL} only produces 1K images; use {DEFAULT_IMAGE_MODEL} for {image_size}")
    if not 1 <= number_of_images <= MAX_IMAGES_PER_REQUEST:
        raise ValueError(f"number_of_images must be between 1 and {MAX_IMAGES_PER_REQUEST}")


def _run(
    client: genai.Client,
    model: str,
    prompt: str,
    images: Sequence[Image.Image] = (),
    aspect_ratio: Optional[str] = None,
    image_size: Optional[str] = None,
    number_of_images: int = 1,
) -> List[Image.Image]:
    """Run one image request, repeated number_of_images times in parallel.

    An interaction yields one image, so variations are separate calls.
    """
    _validate(model, aspect_ratio, image_size, number_of_images)

    response_format: Dict[str, str] = {"type": "image"}
    if aspect_ratio:
        response_format["aspect_ratio"] = aspect_ratio
    if image_size:
        response_format["image_size"] = image_size

    model_input: Any = prompt
    if images:
        model_input = [{"type": "text", "text": prompt}, *[_image_part(img) for img in images]]

    def call(_: int) -> List[Image.Image]:
        interaction = client.interactions.create(
            model=model,
            input=model_input,
            response_format=response_format,
        )
        return _images_from_interaction(interaction)

    results = _in_parallel(call, number_of_images)
    generated = [image for batch in results for image in batch]
    if not generated:
        raise RuntimeError(f"{model} returned no image for this prompt")
    return generated


def _in_parallel(call: Callable[[int], List[Image.Image]], count: int) -> List[List[Image.Image]]:
    if count == 1:
        return [call(0)]
    with ThreadPoolExecutor(max_workers=count) as pool:
        return list(pool.map(call, range(count)))


def generate_image(
    client: genai.Client,
    prompt: str,
    aspect_ratio: str = "1:1",
    model: str = DEFAULT_IMAGE_MODEL,
    number_of_images: int = 1,
    negative_prompt: Optional[str] = None,
    image_size: Optional[str] = None,
) -> List[Image.Image]:
    """
    Generate images from a text prompt.

    Args:
        client (genai.Client): An initialized Gemini API client
        prompt (str): A text description of the image to generate
        aspect_ratio (str, optional): One of ASPECT_RATIOS. Defaults to "1:1".
        model (str, optional): DEFAULT_IMAGE_MODEL (Nano Banana 2.1),
            PRO_IMAGE_MODEL or LITE_IMAGE_MODEL.
        number_of_images (int, optional): Number of images to generate (1-4).
        negative_prompt (str, optional): Things to avoid. Nano Banana has no
            negative-prompt field, so this is appended to the prompt.
        image_size (str, optional): "1K", "2K" or "4K". The model default is 1K.

    Returns:
        List[Image.Image]: List of PIL Image objects
    """
    if negative_prompt:
        prompt = f"{prompt}\n\nAvoid: {negative_prompt}"

    return _run(
        client,
        model,
        prompt,
        aspect_ratio=aspect_ratio,
        image_size=image_size,
        number_of_images=number_of_images,
    )


def edit_image_with_gemini(
    client: genai.Client,
    image: Image.Image,
    prompt: str,
    number_of_images: int = 1,
    model: str = DEFAULT_IMAGE_MODEL,
    aspect_ratio: Optional[str] = None,
    image_size: Optional[str] = None,
) -> List[Image.Image]:
    """
    Edit an image: add, remove or modify elements, restyle, or regrade it.

    Args:
        client (genai.Client): An initialized Gemini API client
        image (Image.Image): PIL Image to edit
        prompt (str): Description of how to edit the image
        number_of_images (int): Number of variations to generate (1-4)
        model (str, optional): Defaults to Nano Banana 2.1.
        aspect_ratio (str, optional): Leave unset to keep the source image's shape.
        image_size (str, optional): "1K", "2K" or "4K".

    Returns:
        List[Image.Image]: List of edited PIL Images
    """
    return _run(
        client,
        model,
        prompt,
        images=[image],
        aspect_ratio=aspect_ratio,
        image_size=image_size,
        number_of_images=number_of_images,
    )


def generate_with_reference_image(
    client: genai.Client,
    prompt: str,
    reference_image: Image.Image,
    aspect_ratio: str = "1:1",
    number_of_images: int = 1,
    model: str = DEFAULT_IMAGE_MODEL,
) -> List[Image.Image]:
    """
    Generate new images guided by a reference image's style and composition.

    The reference is handed to the image model directly, so it sees the actual
    pixels rather than a text description of them.

    Args:
        client (genai.Client): An initialized Gemini API client
        prompt (str): Text description of what to generate
        reference_image (Image.Image): Reference image for style/content guidance
        aspect_ratio (str): Aspect ratio for generated images
        number_of_images (int): Number of images to generate
        model (str, optional): Defaults to Nano Banana 2.1.

    Returns:
        List[Image.Image]: List of generated PIL Images
    """
    guided_prompt = (
        f"{prompt}\n\nUse the attached image as a reference for style, colour "
        "palette and composition. Generate a new image; do not copy it."
    )
    return _run(
        client,
        model,
        guided_prompt,
        images=[reference_image],
        aspect_ratio=aspect_ratio,
        number_of_images=number_of_images,
    )


def batch_generate_images(
    client: genai.Client,
    prompts: List[str],
    **kwargs
) -> List[List[Image.Image]]:
    """
    Generate images for multiple prompts.

    Args:
        client (genai.Client): An initialized Gemini API client
        prompts (List[str]): List of prompts to generate images for
        **kwargs: Additional arguments to pass to generate_image()

    Returns:
        List[List[Image.Image]]: List of image lists, one per prompt. A prompt
        that fails yields an empty list rather than aborting the batch.
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
        print("1. Generating a single image...")
        images = generate_image(client, "A futuristic AI research lab")
        images[0].save("basic_image.png")
        print("Saved basic_image.png")

        print("2. Generating a 2K panorama...")
        images = generate_image(
            client,
            "A serene mountain landscape at sunset",
            aspect_ratio="21:9",
            image_size="2K",
        )
        images[0].save("landscape.png")
        print("Saved landscape.png")

        print("3. Editing an image...")
        edited = edit_image_with_gemini(client, images[0], "Add a rainbow in the sky")
        edited[0].save("edited_image.png")
        print("Saved edited_image.png")

        print("4. Generating from a reference image...")
        referenced = generate_with_reference_image(
            client,
            "A quiet harbour town at dawn",
            reference_image=images[0],
            aspect_ratio="16:9",
        )
        referenced[0].save("reference_image.png")
        print("Saved reference_image.png")

    finally:
        try:
            client.close()
        except Exception:
            pass