import markdown
import json
from typing import Optional, List, Dict, Any, Literal
from pathlib import Path
from datetime import datetime
from pydantic import BaseModel
from google import genai
from google.genai import types
from google.genai.errors import APIError

from main import gemini_generate


# Fixed structured output schemas
class DocumentSection(BaseModel):
    """Schema for a document section."""
    heading: str
    content: str


class DocumentStructure(BaseModel):
    """Schema for structured document generation."""
    title: str
    sections: List[DocumentSection]  # Fixed: Use proper model instead of Dict
    keywords: List[str]
    summary: str
    word_count: int


class DocumentAnalysis(BaseModel):
    """Schema for document analysis."""
    readability_score: int  # 1-10
    main_topics: List[str]
    key_points: List[str]
    suggested_improvements: List[str]
    target_audience: str
    tone: str


def generate_document_content(
    client: genai.Client,
    topic: str,
    length: Literal["short", "medium", "long", "comprehensive"] = "medium",
    style: Literal["technical", "casual", "formal", "academic", "creative"] = "formal",
    target_audience: str = "general",
    include_citations: bool = False,
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Generate document content using AI based on a topic.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        topic (str): The topic or subject for the document
        length (str, optional): Document length. Defaults to "medium".
            Options: "short" (~500 words), "medium" (~1500 words), 
                    "long" (~3000 words), "comprehensive" (~5000+ words)
        style (str, optional): Writing style. Defaults to "formal".
        target_audience (str, optional): Target audience description. Defaults to "general".
        include_citations (bool, optional): Include citations. Defaults to False.
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        str: Generated markdown-formatted document content
    
    Example:
        >>> content = generate_document_content(
        ...     client,
        ...     "The Future of Artificial Intelligence",
        ...     length="long",
        ...     style="academic"
        ... )
    """
    length_guides = {
        "short": "approximately 500 words (2-3 pages)",
        "medium": "approximately 1,500 words (5-6 pages)",
        "long": "approximately 3,000 words (10-12 pages)",
        "comprehensive": "approximately 5,000+ words (15+ pages)"
    }
    
    prompt = f"""Write a {style} document about: {topic}

Requirements:
- Length: {length_guides[length]}
- Style: {style}
- Target Audience: {target_audience}
- Format: Markdown with proper headings (use ##, ###, etc.)
- Include: Introduction, main sections with subheadings, and conclusion
{"- Include citations in [Author, Year] format" if include_citations else ""}

Create a well-structured, informative, and engaging document."""

    config = types.GenerateContentConfig(
        system_instruction=f"You are an expert {style} writer creating high-quality documents for {target_audience} audiences."
    )
    try:
        response = gemini_generate(client, label="document",
            model=model,
            contents=prompt,
            config=config
        )
        return response.text
    
    except APIError as e:
        print(f"API Error: {e.code} - {e.message}")
        raise


def generate_document_structured(
    client: genai.Client,
    topic: str,
    num_sections: int = 5,
    model: str = "gemini-3.5-flash"
) -> DocumentStructure:
    """
    Generate a structured document with explicit sections.
    
    Returns structured JSON with title, sections, keywords, and summary.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        topic (str): The topic for the document
        num_sections (int, optional): Number of main sections. Defaults to 5.
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        DocumentStructure: Structured document data
    
    Example:
        >>> doc = generate_document_structured(client, "Climate Change")
        >>> for section in doc.sections:
        ...     print(f"## {section.heading}")
        ...     print(section.content)
    """
    prompt = f"""Create a structured document about: {topic}

Generate a document with:
- A compelling title
- {num_sections} main sections, each with a heading and content (200-300 words per section)
- A list of 5-10 keywords
- A brief summary (100 words)
- Word count estimate

Format the output as structured JSON."""

    response = gemini_generate(client, label="document",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=DocumentStructure,
            temperature=0.5
        )
    )
    
    return DocumentStructure.model_validate_json(response.text)


def expand_document(
    client: genai.Client,
    content: str,
    expansion_factor: float = 1.5,
    focus_areas: Optional[List[str]] = None,
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Expand existing document content with more detail.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        content (str): The existing document content
        expansion_factor (float, optional): How much to expand (1.5 = 50% longer). Defaults to 1.5.
        focus_areas (List[str], optional): Specific areas to expand. Defaults to None.
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        str: Expanded document content
    
    Example:
        >>> expanded = expand_document(
        ...     client, 
        ...     brief_content, 
        ...     expansion_factor=2.0,
        ...     focus_areas=["technical details", "examples"]
        ... )
    """
    focus_instruction = ""
    if focus_areas:
        focus_instruction = f"\nFocus expansion on: {', '.join(focus_areas)}"
    
    prompt = f"""Expand the following document by approximately {int((expansion_factor - 1) * 100)}%:

{content}

{focus_instruction}

Add more detail, examples, explanations, and depth while maintaining the original structure and style.
Keep the same markdown formatting."""

    response = gemini_generate(client, label="document",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.5)
    )
    
    return response.text


def summarize_document(
    client: genai.Client,
    content: str,
    length: Literal["brief", "moderate", "detailed"] = "moderate",
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Generate a summary of document content.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        content (str): The document content to summarize
        length (str, optional): Summary length. Defaults to "moderate".
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        str: Summary of the document
    
    Example:
        >>> summary = summarize_document(client, long_document, length="brief")
    """
    length_guides = {
        "brief": "2-3 sentences",
        "moderate": "1-2 paragraphs",
        "detailed": "3-5 paragraphs"
    }
    
    prompt = f"""Summarize the following document in {length_guides[length]}:

{content}

Capture the main points and key takeaways."""

    response = gemini_generate(client, label="document",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.3)
    )
    
    return response.text


def analyze_document(
    client: genai.Client,
    content: str,
    model: str = "gemini-3.5-flash"
) -> DocumentAnalysis:
    """
    Analyze document quality and provide insights.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        content (str): The document content to analyze
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        DocumentAnalysis: Structured analysis of the document
    
    Example:
        >>> analysis = analyze_document(client, document_content)
        >>> print(f"Readability: {analysis.readability_score}/10")
        >>> print(f"Main topics: {analysis.main_topics}")
    """
    prompt = f"""Analyze the following document:

{content}

Provide:
- Readability score (1-10, where 10 is most readable)
- Main topics covered
- Key points and takeaways
- Suggested improvements
- Target audience description
- Overall tone (formal, casual, technical, etc.)"""

    response = gemini_generate(client, label="document",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=DocumentAnalysis,
            temperature=0.2
        )
    )
    
    return DocumentAnalysis.model_validate_json(response.text)


def translate_document(
    client: genai.Client,
    content: str,
    target_language: str,
    preserve_formatting: bool = True,
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Translate document content to another language.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        content (str): The document content to translate
        target_language (str): Target language (e.g., "Spanish", "French", "Japanese")
        preserve_formatting (bool, optional): Keep markdown formatting. Defaults to True.
        model (str, optional): Model to use. Defaults to "gemini-3.5-flash".
    
    Returns:
        str: Translated document content
    
    Example:
        >>> spanish_doc = translate_document(client, english_doc, "Spanish")
    """
    format_instruction = "Preserve all markdown formatting (headings, lists, code blocks, etc.)." if preserve_formatting else ""
    
    prompt = f"""Translate the following document to {target_language}:

{content}

{format_instruction}
Maintain the document's tone and style."""

    response = gemini_generate(client, label="document",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.3)
    )
    
    return response.text


def improve_document(
    client: genai.Client,
    content: str,
    improvements: List[str],
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Improve document based on specific criteria.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        content (str): The document content to improve
        improvements (List[str]): List of improvements to make
        model (str, optional): Model to use. Defaults to "gemini-2.5-pro".
    
    Returns:
        str: Improved document content
    
    Example:
        >>> improved = improve_document(
        ...     client,
        ...     draft,
        ...     ["improve readability", "add more examples", "strengthen conclusion"]
        ... )
    """
    improvements_str = "\n".join(f"- {imp}" for imp in improvements)
    
    prompt = f"""Improve the following document based on these criteria:

{improvements_str}

Original document:
{content}

Provide the improved version while maintaining the overall structure and message."""

    response = gemini_generate(client, label="document",
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.5)
    )
    
    return response.text


def generate_with_research(
    client: genai.Client,
    topic: str,
    use_grounding: bool = True,
    model: str = "gemini-3.5-flash"
) -> str:
    """
    Generate document with web research for accuracy.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        topic (str): The topic to research and write about
        use_grounding (bool, optional): Use Google Search grounding. Defaults to True.
        model (str, optional): Model to use. Defaults to "gemini-2.5-pro".
    
    Returns:
        str: Research-backed document content
    
    Example:
        >>> doc = generate_with_research(
        ...     client,
        ...     "Latest developments in quantum computing 2024"
        ... )
    """
    prompt = f"""Write a well-researched document about: {topic}

Use current, factual information. Include:
- Introduction
- Main sections with detailed information
- Current statistics and developments
- Conclusion

Format in markdown with proper headings."""

    config = types.GenerateContentConfig(
        temperature=0.4,
    )
    
    # Add Google Search grounding if requested
    if use_grounding:
        config.tools = [{"google_search": {}}]

    response = gemini_generate(client, label="document",
        model=model,
        contents=prompt,
        config=config
    )
    
    # Include grounding metadata if available
    result = response.text
    
    if hasattr(response.candidates[0], 'grounding_metadata') and response.candidates[0].grounding_metadata:
        result += "\n\n---\n\n### Sources\n\n"
        result += "This document was generated using web search grounding.\n\n"
        
        if response.candidates[0].grounding_metadata.web_search_queries:
            result += f"Search queries used: {', '.join(response.candidates[0].grounding_metadata.web_search_queries)}\n"
    
    return result


def generate_document(
    content: str, 
    title: str = "Document",
    format: Literal["html", "markdown"] = "html",
    theme: str = "default",
    include_toc: bool = False,
    output_dir: Optional[str] = None
) -> str:
    """
    Generate a document from markdown content and save it to a file.
    
    This function converts markdown-formatted text into a styled HTML or Markdown
    document with syntax highlighting support for code blocks. The generated file
    includes styling for readability.
    
    Args:
        content (str): The markdown-formatted content to convert
        title (str, optional): The title for the document. Defaults to "Document".
        format (str, optional): Output format - "html" or "markdown". Defaults to "html".
        theme (str, optional): Visual theme. Defaults to "default".
            Options: "default", "dark", "minimal", "academic"
        include_toc (bool, optional): Include table of contents. Defaults to False.
        output_dir (str, optional): Output directory. Defaults to current directory.
    
    Returns:
        str: The path to the generated document file
    
    Example:
        >>> markdown_content = "# My Report\\n\\nThis is a **bold** statement."
        >>> filename = generate_document(
        ...     markdown_content, 
        ...     "My Report",
        ...     format="html",
        ...     theme="academic",
        ...     include_toc=True
        ... )
    """
    # Setup output path
    if output_dir:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        base_path = Path(output_dir)
    else:
        base_path = Path.cwd()
    
    if format == "markdown":
        filename = base_path / f"{title.replace(' ', '_')}.md"
        
        # Add title and metadata
        output_content = f"# {title}\n\n"
        output_content += f"*Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n\n"
        
        if include_toc:
            output_content += generate_toc(content) + "\n\n"
        
        output_content += content
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(output_content)
        
        return str(filename)
    
    # HTML generation
    html_content = markdown.markdown(
        content, 
        extensions=['extra', 'codehilite', 'toc', 'tables', 'fenced_code']
    )
    
    # Select theme
    themes = {
        "default": {
            "bg": "#ffffff",
            "text": "#333333",
            "code_bg": "#f4f4f4",
            "accent": "#2c3e50"
        },
        "dark": {
            "bg": "#1e1e1e",
            "text": "#d4d4d4",
            "code_bg": "#2d2d2d",
            "accent": "#569cd6"
        },
        "minimal": {
            "bg": "#fefefe",
            "text": "#2c2c2c",
            "code_bg": "#f8f8f8",
            "accent": "#000000"
        },
        "academic": {
            "bg": "#fafafa",
            "text": "#1a1a1a",
            "code_bg": "#f0f0f0",
            "accent": "#1a0dab"
        }
    }
    
    theme_colors = themes.get(theme, themes["default"])
    
    # Generate TOC if requested
    toc_html = ""
    if include_toc:
        toc_html = '<div class="toc"><h2>Table of Contents</h2>' + \
                   markdown.markdown(content, extensions=['toc']) + '</div>'
    
    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.6;
            background-color: {theme_colors['bg']};
            color: {theme_colors['text']};
        }}
        h1, h2, h3, h4, h5, h6 {{
            color: {theme_colors['accent']};
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }}
        h1 {{ font-size: 2em; border-bottom: 2px solid {theme_colors['accent']}; padding-bottom: 0.3em; }}
        h2 {{ font-size: 1.5em; border-bottom: 1px solid {theme_colors['code_bg']}; padding-bottom: 0.3em; }}
        h3 {{ font-size: 1.25em; }}
        code {{
            background-color: {theme_colors['code_bg']};
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }}
        pre {{
            background-color: {theme_colors['code_bg']};
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            line-height: 1.45;
        }}
        pre code {{
            background-color: transparent;
            padding: 0;
        }}
        blockquote {{
            border-left: 4px solid {theme_colors['accent']};
            margin: 0;
            padding-left: 16px;
            color: #6a737d;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
        }}
        th, td {{
            border: 1px solid {theme_colors['code_bg']};
            padding: 8px 12px;
            text-align: left;
        }}
        th {{
            background-color: {theme_colors['code_bg']};
            font-weight: 600;
        }}
        .toc {{
            background-color: {theme_colors['code_bg']};
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 30px;
        }}
        .toc h2 {{
            margin-top: 0;
        }}
        a {{
            color: {theme_colors['accent']};
            text-decoration: none;
        }}
        a:hover {{
            text-decoration: underline;
        }}
        .footer {{
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid {theme_colors['code_bg']};
            font-size: 0.9em;
            color: #6a737d;
        }}
        @media print {{
            body {{ max-width: 100%; padding: 20px; }}
            .toc {{ page-break-after: always; }}
        }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    {toc_html}
    {html_content}
    <div class="footer">
        <p>Generated on {datetime.now().strftime('%Y-%m-%d at %H:%M')}</p>
    </div>
</body>
</html>"""
    
    filename = base_path / f"{title.replace(' ', '_')}.html"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(html_template)
    
    return str(filename)


def generate_toc(content: str) -> str:
    """Generate a table of contents from markdown headings."""
    lines = content.split('\n')
    toc_lines = []
    
    for line in lines:
        if line.startswith('#'):
            level = len(line) - len(line.lstrip('#'))
            heading = line.lstrip('#').strip()
            indent = '  ' * (level - 1)
            toc_lines.append(f"{indent}- {heading}")
    
    return '\n'.join(toc_lines)


def batch_generate_documents(
    client: genai.Client,
    topics: List[str],
    **kwargs
) -> List[str]:
    """
    Generate multiple documents efficiently.
    
    Args:
        client (genai.Client): An initialized Gemini API client
        topics (List[str]): List of topics to generate documents for
        **kwargs: Additional arguments to pass to generate_document_content()
    
    Returns:
        List[str]: List of file paths to generated documents
    
    Example:
        >>> topics = ["AI Ethics", "Machine Learning", "Data Science"]
        >>> files = batch_generate_documents(client, topics, length="medium")
    """
    results = []
    for topic in topics:
        try:
            content = generate_document_content(client, topic, **kwargs)
            filepath = generate_document(content, title=topic)
            results.append(filepath)
            print(f"✓ Generated: {filepath}")
        except Exception as e:
            print(f"❌ Failed to generate document for '{topic}': {e}")
            results.append(None)
    
    return results


# Usage Examples
if __name__ == "__main__":
    from main import create_client
    
    client = create_client()
    
    try:
        print("=" * 80)
        print("DOCUMENT GENERATION EXAMPLES")
        print("=" * 80)
        
        # Example 1: Generate document with AI
        print("\n1. Generating document with AI...")
        content = generate_document_content(
            client,
            "The Impact of Artificial Intelligence on Healthcare",
            length="medium",
            style="technical"
        )
        filepath = generate_document(content, "AI_in_Healthcare", theme="academic")
        print(f"✓ Generated: {filepath}")
        
        # Example 2: Structured document generation
        print("\n2. Generating structured document...")
        structured_doc = generate_document_structured(
            client,
            "Climate Change Solutions",
            num_sections=4
        )
        print(f"Title: {structured_doc.title}")
        print(f"Sections: {len(structured_doc.sections)}")
        print(f"Keywords: {structured_doc.keywords}")
        
        # Convert structured doc to markdown
        structured_content = f"# {structured_doc.title}\n\n"
        structured_content += f"**Summary:** {structured_doc.summary}\n\n"
        for section in structured_doc.sections:
            structured_content += f"## {section.heading}\n\n{section.content}\n\n"
        
        filepath = generate_document(structured_content, structured_doc.title)
        print(f"✓ Generated: {filepath}")
        
        # Example 3: Research-backed document
        print("\n3. Generating research-backed document...")
        research_content = generate_with_research(
            client,
            "Latest developments in quantum computing",
            use_grounding=True
        )
        filepath = generate_document(
            research_content,
            "Quantum_Computing_2024",
            include_toc=True
        )
        print(f"✓ Generated: {filepath}")
        
        # Example 4: Document analysis
        print("\n4. Analyzing document...")
        analysis = analyze_document(client, content)
        print(f"Readability: {analysis.readability_score}/10")
        print(f"Main topics: {analysis.main_topics}")
        print(f"Tone: {analysis.tone}")
        
        # Example 5: Document summarization
        print("\n5. Summarizing document...")
        summary = summarize_document(client, content, length="brief")
        print(f"Summary: {summary}")
        
        # Example 6: Expand document
        print("\n6. Expanding document...")
        brief = "# Machine Learning\n\nML is a subset of AI."
        expanded = expand_document(
            client,
            brief,
            expansion_factor=3.0,
            focus_areas=["algorithms", "applications"]
        )
        print(f"Original length: {len(brief)}")
        print(f"Expanded length: {len(expanded)}")
        
        # Example 7: Translate document
        print("\n7. Translating document...")
        spanish = translate_document(client, "# Hello\n\nThis is a test.", "Spanish")
        print(f"Translated: {spanish[:100]}...")
        
        # Example 8: Improve document
        print("\n8. Improving document...")
        improved = improve_document(
            client,
            brief,
            ["add examples", "improve clarity", "expand explanations"]
        )
        print(f"Improved length: {len(improved)}")
        
        # Example 9: Batch generation
        print("\n9. Batch generating documents...")
        topics = [
            "Neural Networks Basics",
            "Deep Learning Applications",
            "Natural Language Processing"
        ]
        files = batch_generate_documents(
            client,
            topics,
            length="short",
            style="technical"
        )
        print(f"✓ Generated {len([f for f in files if f])} documents")
        
        # Example 10: Different themes
        print("\n10. Generating documents with different themes...")
        themes = ["default", "dark", "minimal", "academic"]
        for theme in themes:
            filepath = generate_document(
                "# Test Document\n\nSample content.",
                f"Theme_{theme}",
                theme=theme
            )
            print(f"✓ Generated {theme} theme: {filepath}")
        
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

# def generate_document(content: str, title: str = "Document") -> str:
#     """
#     Generate an HTML document from markdown content and save it to a file.
    
#     This function converts markdown-formatted text into a styled HTML document with
#     syntax highlighting support for code blocks. The generated HTML file includes
#     basic styling for readability and is saved with a filename derived from the title.
    
#     Args:
#         content (str): The markdown-formatted content to convert to HTML
#         title (str, optional): The title for the document, used both in the HTML
#             <title> tag and to generate the output filename. Defaults to "Document".
    
#     Returns:
#         str: The filename of the generated HTML document (title with spaces replaced
#             by underscores and .html extension)
    
#     Example:
#         >>> markdown_content = "# My Report\\n\\nThis is a **bold** statement."
#         >>> filename = generate_document(markdown_content, "My Report")
#         >>> print(filename)
#         My_Report.html
#     """
#     html_content = markdown.markdown(content, extensions=['extra', 'codehilite'])
    
#     html_template = f"""
#     <!DOCTYPE html>
#     <html>
#     <head>
#         <title>{title}</title>
#         <style>
#             body {{ font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }}
#             code {{ background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; }}
#             pre {{ background-color: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }}
#         </style>
#     </head>
#     <body>
#         {html_content}
#     </body>
#     </html>
#     """
    
#     filename = f"{title.replace(' ', '_')}.html"
#     with open(filename, 'w') as f:
#         f.write(html_template)
    
#     return filename

# # Usage
# if __name__ == "__main__":
#     client = create_client()
#     content = """{'stdout': '', 'stderr': '  File "C:\\Users\\sidki\\AppData\\Local\\Temp\\tmpxhmng1f7.py", line 7\n    This method is fast, memory-efficient, and avoids Python\'s recursion depth limits, making it suitable for production code.\n                                                            ^\nSyntaxError: unterminated string literal (detected at line 7)\n', 'returncode': 1}
# Of course. Here is a well-documented Python function to calculate Fibonacci numbers, including robust error handling and a discussion of different algorithmic approaches.

# The most efficient and practical method for calculating Fibonacci numbers is the **iterative approach**, as it avoids the massive overhead of recursion and has a linear time complexity. We will present this as the primary solution.

# ### Recommended Method: Iterative Approach

# This method is fast, memory-efficient, and avoids Python's recursion depth limits, making it suitable for production code.

# ```python
# def fibonacci(n: int) -> int:

#     ''' Calculates the nth Fibonacci number using an iterative approach.

#     The Fibonacci sequence is defined as:
#     F(0) = 0
#     F(1) = 1
#     F(n) = F(n-1) + F(n-2) for n > 1

#     This implementation is highly efficient, with O(n) time complexity
#     and O(1) space complexity.

#     Args:
#         n (int): The index of the Fibonacci number to calculate.
#                  Must be a non-negative integer.

#     Returns:
#         int: The nth Fibonacci number.

#     Raises:
#         TypeError: If n is not an integer.
#         ValueError: If n is a negative integer.
#     '''
#     # --- Error Handling ---
#     if not isinstance(n, int):
#         raise TypeError("Input must be an integer.")
#     if n < 0:
#         raise ValueError("Input must be a non-negative integer.")

#     # --- Base Cases ---
#     if n == 0:
#         return 0
#     if n == 1:
#         return 1

#     # --- Iterative Calculation ---
#     # Initialize the first two numbers in the sequence
#     a, b = 0, 1

#     # We've already handled n=0 and n=1, so we loop from 2 up to n.
#     # The range(2, n + 1) will execute n-1 times.
#     for _ in range(2, n + 1):
#         # Calculate the next number in the sequence
#         # and update the two previous numbers.
#         # a becomes the old b, and b becomes the new sum.
#         a, b = b, a + b

#     return b

# # --- Usage Example ---
# if __name__ == "__main__":
#     print("--- Calculating Fibonacci Numbers ---")

#     # --- Valid Inputs ---
#     try:
#         print(f"The 0th Fibonacci number is: {fibonacci(0)}")   # Expected: 0
#         print(f"The 1st Fibonacci number is: {fibonacci(1)}")   # Expected: 1
#         print(f"The 9th Fibonacci number is: {fibonacci(9)}")   # Expected: 34
#         print(f"The 20th Fibonacci number is: {fibonacci(20)}") # Expected: 6765
#     except (ValueError, TypeError) as e:
#         print(f"An unexpected error occurred: {e}")

#     print("\n--- Testing Error Handling ---")

#     # --- Invalid Input: Negative Number ---
#     try:
#         fibonacci(-5)
#     except ValueError as e:
#         print(f"Caught expected error for n=-5: {e}")

#     # --- Invalid Input: Non-integer ---
#     try:
#         fibonacci(9.5)
#     except TypeError as e:
#         print(f"Caught expected error for n=9.5: {e}")

#     # --- Invalid Input: String ---
#     try:
#         fibonacci("hello")
#     except TypeError as e:
#         print(f"Caught expected error for n='hello': {e}")

# ```

# ### Alternative Implementations (for educational purposes)

# While the iterative approach is best, it's useful to understand other methods and their trade-offs.

# #### 1. Recursive Approach with Memoization

# This version uses recursion but stores (caches) results to avoid re-calculating them. This technique is a form of dynamic programming and is much more efficient than naive recursion.

# ```python
# def fibonacci_memoized(n: int, cache: dict = None) -> int:
#     '''
#     Calculates the nth Fibonacci number using recursion with memoization.

#     This improves upon the naive recursive approach by caching results,
#     achieving O(n) time complexity but with O(n) space complexity for the cache.
#     '''
#     if cache is None:
#         cache = {}

#     # Error handling
#     if not isinstance(n, int):
#         raise TypeError("Input must be an integer.")
#     if n < 0:
#         raise ValueError("Input must be a non-negative integer.")

#     # Check if the value is already in the cache
#     if n in cache:
#         return cache[n]

#     # Base cases
#     if n == 0:
#         return 0
#     if n == 1:
#         return 1

#     # Recursive step: calculate, cache, and then return
#     result = fibonacci_memoized(n - 1, cache) + fibonacci_memoized(n - 2, cache)
#     cache[n] = result
#     return result
# ```

# #### 2. Naive Recursive Approach (Not Recommended)

# This is a direct translation of the mathematical definition. It is simple to write but **extremely inefficient** due to redundant calculations, resulting in O(2^n) time complexity. It should be avoided for any `n` greater than ~30.

# ```python
# def fibonacci_naive_recursive(n: int) -> int:
#     '''
#     Calculates the nth Fibonacci number using a naive recursive approach.

#     WARNING: This implementation is highly inefficient (O(2^n) time complexity)
#     and should not be used in practice for anything but very small values of n.
#     '''
#     # Error handling
#     if not isinstance(n, int):
#         raise TypeError("Input must be an integer.")
#     if n < 0:
#         raise ValueError("Input must be a non-negative integer.")

#     # Base cases
#     if n <= 1:
#         return n

#     # Recursive step
#     return fibonacci_naive_recursive(n - 1) + fibonacci_naive_recursive(n - 2)
# ```

# ### Comparison of Methods

# | Method                  | Time Complexity | Space Complexity | Notes                                                              |
# | ----------------------- | :-------------: | :--------------: | ------------------------------------------------------------------ |
# | **Iterative (Recommended)** |      O(n)       |       O(1)       | **Best choice.** Fast, memory-efficient, no recursion limits.        |
# | Recursive w/ Memoization |      O(n)       |       O(n)       | Good performance, but uses more memory and can hit recursion limits. |
# | Naive Recursive         |     O(2^n)      |       O(n)       | **Extremely slow.** Only for educational or demonstration purposes.  |"""
#     title = "Code Gen"
#     filename = generate_document(content, title)
#     print(f"Document saved to {filename}")