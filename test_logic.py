import pandas as pd
from logic import calculate_metrics

# Test Cases
def test_calculation():
    data = {
        '기간': ['2026.02.24.', '2026.02.24.'],
        '광고 그룹 이름': ['SKP_Group', 'Normal_Group'],
        '총 비용': [110000, 110000]
    }
    df = pd.DataFrame(data)
    
    # Base fee 15%
    # Case 1: SKP (DMP) -> Fee = 25% -> Exec = 110000 / (1 - 0.25) = 110000 / 0.75 = 146666.67
    # Case 2: Normal -> Fee = 15% -> Exec = 110000 / (1 - 0.15) = 110000 / 0.85 = 129411.76
    
    # If NaverGFA:
    # Case 1: 146666.67 / 1.1 = 133333.33, NET = 110000 / 1.1 = 100000
    # Case 2: 129411.76 / 1.1 = 117647.05, NET = 110000 / 1.1 = 100000
    
    df = calculate_metrics(df, 15.0, '네이버GFA')
    
    print("Test Results (NaverGFA):")
    print(df[['광고 그룹 이름', '집행 금액', 'NET']])
    
    # Assertions
    assert round(df.loc[0, '집행 금액'], 2) == 133333.33
    assert round(df.loc[0, 'NET'], 2) == 100000.00
    assert round(df.loc[1, '집행 금액'], 2) == 117647.06
    
    print("\nVerification Successful!")

if __name__ == "__main__":
    test_calculation()
