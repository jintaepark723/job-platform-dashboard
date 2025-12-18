import fs from 'fs/promises';

async function clearChanges() {
  console.log('🔄 플랫폼 변경 플래그 초기화 중...\n');

  const filePath = 'results/results_temp.json';

  try {
    const rawData = await fs.readFile(filePath, 'utf-8');
    const jsonData = JSON.parse(rawData);
    const results = jsonData.results || jsonData;

    let clearedCount = 0;

    const cleanedResults = results.map(result => {
      if (result.platformChanged) {
        clearedCount++;
        const { platformChanged, previousPlatform, changedAt, ...cleaned } = result;
        return cleaned;
      }
      return result;
    });

    const outputData = {
      metadata: {
        totalCompanies: cleanedResults.length,
        crawledAt: new Date().toISOString()
      },
      results: cleanedResults
    };

    await fs.writeFile(filePath, JSON.stringify(outputData, null, 2), 'utf-8');

    console.log('✅ 완료!');
    console.log(`📊 ${clearedCount}개 회사의 변경 플래그 초기화`);

  } catch (error) {
    console.error('❌ 실패:', error);
  }
}

clearChanges().catch(console.error);
