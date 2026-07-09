import pandas as pd

# Create a sample CSV with some missing data
df = pd.DataFrame({
    'date': ['2024-01-01', '2024-01-02', '2024-01-03'],
    'symbol': ['ETH', 'BTC', 'ETH'],
    'price': [2000, None, 2100],  # Missing value here
    'volume': [1000000, 2000000, None]  # Missing value here
})
df.to_csv('test_missing_data.csv', index=False)