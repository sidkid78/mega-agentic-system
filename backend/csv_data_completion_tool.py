import json
import pandas as pd
from google import genai
from main import DEFAULT_MODEL, gemini_generate


def analyze_missing_data(csv_path: str, client: genai.Client) -> str:
    """
    Analyze a CSV file to identify missing data and generate context-aware questions for completion.
    
    This function scans through a CSV file to find all missing (NaN) values and uses the Gemini AI
    model to generate intelligent questions that can help fill in those missing values. For each
    missing cell, it considers the context of other non-missing values in the same row to create
    relevant questions.
    
    Args:
        csv_path (str): The file path to the CSV file to analyze
        
    Returns:
        str: A JSON-formatted string containing:
            - missing_cells: List of dictionaries with details about each missing cell including:
                - row: The row index of the missing value
                - column: The column index of the missing value
                - question: An AI-generated question to help fill the missing value
                - context: The available data from the same row
            - total_missing: Total count of missing cells
            - completion_rate: Percentage of cells that are filled (0.0 to 1.0)
    
    Example:
        >>> result = analyze_missing_data("data.csv")
        >>> print(result)
        {
          "missing_cells": [
            {
              "row": 0,
              "column": 2,
              "question": "What is the price for this entry?",
              "context": "{'date': '2024-01-01', 'symbol': 'ETH'}"
            }
          ],
          "total_missing": 1,
          "completion_rate": 0.95
        }
    """
    df = pd.read_csv(csv_path)
    missing_cells = []
    
    for row_idx in range(len(df)):
        for col_idx, col_name in enumerate(df.columns):
            if pd.isna(df.iloc[row_idx, col_idx]):
                # Generate context-aware question using Gemini
                context = df.iloc[row_idx].dropna().to_dict()
                
                prompt = f"""Given this data row: {context}
                The missing field is: {col_name}
                Generate a specific question to fill this missing value."""
                
                response = gemini_generate(
                    client,
                    DEFAULT_MODEL,
                    prompt,
                    label="csv",
                )
                
                missing_cells.append({
                    'row': row_idx,
                    'column': col_idx,
                    'question': response.text.strip(),
                    'context': str(context)
                })
    
    return json.dumps({
        'missing_cells': missing_cells,
        'total_missing': len(missing_cells),
        'completion_rate': 1 - (len(missing_cells) / (len(df) * len(df.columns)))
    }, indent=2)

# Usage
# csv_path = r'C:\Users\sidki\source\repos\ultimate\backend\test_missing_data.csv'
# result = analyze_missing_data(csv_path)
# print(result)