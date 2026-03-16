import { CalculationService } from '../src/services/calculationService';

const testGroupBy = () => {
    const rawData = [
        { '날짜': '2024-03-01', '광고 그룹': 'AdGroup1', '노출': 100, '클릭': 10, '집행 금액(VAT 별도)': 1000, '캠페인': 'CampA' },
        { '날짜': '2024-03-01', '광고 그룹': 'AdGroup2', '노출': 200, '클릭': 20, '집행 금액(VAT 별도)': 2000, '캠페인': 'CampA' },
        { '날짜': '2024-03-02', '광고 그룹': 'AdGroup3', '노출': 300, '클릭': 30, '집행 금액(VAT 별도)': 3000, '캠페인': 'CampA' }
    ];

    console.log('--- Testing GroupBy Aggregation (by date) ---');

    const results = CalculationService.processWithDanfo(
        rawData,
        'campaign-1',
        '네이버GFA',
        10,
        ['date_raw'] 
    );

    console.log('Results count:', results.length);
    results.forEach(r => {
        console.log(`Date: ${r.date.toISOString().split('T')[0]} | Impressions: ${r.impressions} | Clicks: ${r.clicks}`);
    });

    const d1 = results.find(r => r.date.toISOString().startsWith('2024-03-01'));
    const d2 = results.find(r => r.date.toISOString().startsWith('2024-03-02'));

    const passed = results.length === 2 && 
                   d1?.impressions === 300 &&
                   d2?.impressions === 300;

    if (passed) {
        console.log('\nGroupBy test passed! ✅');
    } else {
        console.log('\nGroupBy test failed. ❌');
        console.log('D1 Impressions:', d1?.impressions);
        console.log('D2 Impressions:', d2?.impressions);
        process.exit(1);
    }
};

testGroupBy();
