require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    skipLibCheck: true
  }
});

const { CalculationService } = require('../src/services/calculationService');

const testDMP = () => {
  const testCases = [
    { name: 'WIFI_Campaign', expected: 'WIFI' },
    { name: '실내위치_GFA', expected: 'WIFI' },
    { name: 'SKP_Segment', expected: 'SKP' },
    { name: 'LOTTE_Target', expected: 'LOTTE' },
    { name: 'DIRECT_Traffic', expected: 'DIRECT' },
    { name: 123, expected: 'N/A' },
  ];

  console.log('--- Testing DMP Detection ---');
  let allPassed = true;

  testCases.forEach(tc => {
    const rawData = [{ 
      '날짜': '2024-03-01', 
      '광고 그룹': tc.name, 
      '노출': 100, 
      '클릭': 10, 
      '집행 금액(VAT 별도)': 1000 
    }];

    const results = CalculationService.processWithDanfo(
      rawData,
      'campaign-1',
      '네이버GFA',
      10
    );

    const actual = results.raw[0].dmp_type;
    const passed = actual === tc.expected;
    console.log(`Input: ${tc.name} | Expected: ${tc.expected} | Actual: ${actual} | ${passed ? '✅' : '❌'}`);
    if (!passed) allPassed = false;
  });

  if (allPassed) {
    console.log('\nAll DMP tests passed! 🎉');
  } else {
    console.log('\nSome DMP tests failed. ❌');
    process.exit(1);
  }
};

testDMP();
