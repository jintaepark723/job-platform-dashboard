import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import path from 'path';

// Stealth plugin 추가
chromium.use(StealthPlugin());

// 랜덤 지연 함수 (3-8초)
function randomDelay() {
  const delay = Math.floor(Math.random() * 5000) + 3000; // 3000-8000ms
  return new Promise(resolve => setTimeout(resolve, delay));
}

// 회사 도메인 매칭 함수 (한글 회사명 ↔ 영문 도메인)
function isCompanyDomain(domain, companyName, registeredDomain = null) {
  // 등록된 도메인이 있으면 우선 사용
  if (registeredDomain && domain.includes(registeredDomain)) {
    return true;
  }

  // 도메인에서 최상위 도메인 제거 (co.kr, com, net, ai 등)
  const cleanDomain = domain.replace(/\.(co\.kr|com|net|org|ai|io)$/i, '');
  const companyKeyword = companyName.toLowerCase().replace(/\s+/g, '');

  // 도메인이 회사명을 포함하거나, 회사명이 도메인을 포함
  return cleanDomain.includes(companyKeyword) || companyKeyword.includes(cleanDomain);
}

// URL에 채용 키워드가 있는지 체크
function hasRecruitKeywordInURL(url) {
  const urlLower = url.toLowerCase();
  const recruitKeywords = [
    '채용', '인재', '인재상', '복지', 'recruit', 'career', 'jobs',
    'hire', 'hiring', 'employment', 'join', 'talent'
  ];
  return recruitKeywords.some(keyword => urlLower.includes(keyword));
}

// 채용 플랫폼 식별 함수 (우선순위 포함)
function identifyPlatform(url, companyInfo, title = '') {
  const companyName = typeof companyInfo === 'string' ? companyInfo : companyInfo.name;
  const registeredDomain = typeof companyInfo === 'object' ? companyInfo.domain : null;

  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const domain = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();

  // 플랫폼 정의 (우선순위 순서)
  const platforms = [
    // 최우선: 특수목적회사(SPAC) 판별 (가중치: 150 - 매우 높음)
    {
      name: '특수목적회사',
      weight: 150,
      isDedicated: false,
      check: () => {
        const spacKeywords = ['스팩', 'spac', '호스팩'];
        return spacKeywords.some(keyword => companyName.toLowerCase().includes(keyword));
      }
    },

    // 1순위: 대기업 그룹 통합 채용 사이트 (가중치: 95)
    {
      name: '그룹채용',
      weight: 95,
      isDedicated: true,
      check: () => {
        // 주요 그룹 채용 도메인 리스트 (웹 검색으로 확인된 실제 도메인)
        const groupRecruitDomains = [
          // 삼성그룹
          'samsungcareers.com', 'samsung.com/sec/about-us/careers',
          'samsung-dsrecruit.com', 'samsung-dxrecruit.com',
          // LG그룹
          'careers.lg.com',
          // SK그룹
          'skcareers.com',
          // 카카오그룹
          'careers.kakao.com',
          // 현대차그룹
          'talent.hyundai.com', 'careers.hyundaigroup.com',
          'hyundai.co.kr/recruit', 'hyundai-autoever.com',
          // HD현대
          'recruit.hd.com',
          // 한화그룹
          'hanwhain.com',
          // 롯데그룹
          'recruit.lotte.co.kr',
          // CJ그룹 (검색 실패로 추정 도메인 사용)
          'cj.net/career', 'cjcareers.com',
          // 포스코그룹
          'recruit.posco.com', 'poscorecruit.careerlink.kr',
          'poscorecruit.com', 'gorecruit.posco.co.kr',
          // GS그룹 (검색 실패로 추정 도메인 사용)
          'gs.co.kr/recruit', 'gscareers.com',
          // 두산그룹
          'career.doosan.com',
          // KT그룹
          'recruit.kt.com',
          // LS그룹
          'lsholdings.com/ko/careers', 'lsholdings.careerlink.kr',
          // 효성그룹
          'hyosung.recruiter.co.kr',
          // 한진그룹
          'hanjinkal.co.kr/kr/communityid/75',
          // 코오롱그룹
          'dream.kolon.com', 'recruit.kolonfnc.com',
          // 금호그룹
          'recruit.kkpc.com', 'kkpc-recruit',
          // NH농협그룹
          'with.nonghyup.com', 'nhreits.com', 'nhbank.com',
          // 미래에셋그룹
          'career.miraeasset.com',
          // KB금융그룹
          'careers.kbfg.com', 'jobs.kbstar.com',
          // 신한금융그룹
          'shinhan.recruiter.co.kr', 'recruit.shinhansec.com', 'recruit.shinhaninvest.com',
          // 하나금융그룹
          'hanafn.com', 'hanati.recruiter.co.kr', 'hanabank.recruiter.co.kr',
          // 우리금융그룹
          'woorifg.com', 'wooribank.careerlink.kr',
          // 신세계그룹
          'job.shinsegae.com',
          // BGF리테일
          'bgf.recruiter.co.kr',
          // DL그룹 (구 대림)
          'dlenc.recruiter.co.kr', 'daelim.co.kr',
          // OCI그룹
          'oci.career.greetinghr.com'
        ];

        // 1. 도메인이 그룹 채용 사이트에 포함되는지 확인
        const isDomainMatch = groupRecruitDomains.some(recruitDomain => domain.includes(recruitDomain));

        // 2. 타이틀에 '그룹' 키워드가 있는지 확인
        const hasTitleKeyword = titleLower.includes('그룹');

        return isDomainMatch || hasTitleKeyword;
      }
    },

    // 2순위: 자체 개발 채용 사이트 (가중치: 90, 회사 도메인 + 타이틀 키워드)
    {
      name: '자체',
      weight: 90,
      isDedicated: true,
      check: () => {
        // 1단계: 회사 도메인인지 먼저 확인
        if (!isCompanyDomain(domain, companyName, registeredDomain)) {
          return false;
        }

        // 2단계: 타이틀에 채용 관련 키워드가 있는지 확인
        const recruitTitleKeywords = [
          '채용공고', '채용 공고', '채용중', '모집중', '모집 중',
          'job opening', 'job posting', 'careers', 'join us',
          'we are hiring', 'now hiring'
        ];
        return recruitTitleKeywords.some(keyword =>
          titleLower.includes(keyword.toLowerCase())
        );
      }
    },

    // 2순위: 전용 HR 플랫폼 (가중치: 80, 등장시 확정)
    { name: '그리팅', weight: 80, isDedicated: true, check: () => urlLower.includes('greetinghr') },
    { name: '마이다스인', weight: 80, isDedicated: true, check: () => domain.includes('recruiter.co.kr') },
    { name: '잡다', weight: 80, isDedicated: true, check: () => domain.includes('recruiter.im') },
    { name: '나인하이어', weight: 80, isDedicated: true, check: () => domain.includes('ninehire.site') },

    // 3순위: 주요 채용 플랫폼 (가중치: 50)
    { name: '원티드', weight: 50, isDedicated: false, check: () => domain.includes('wanted.co.kr') },
    { name: '로켓펀치', weight: 50, isDedicated: false, check: () => domain.includes('rocketpunch.com') },
    { name: '프로그래머스', weight: 50, isDedicated: false, check: () => domain.includes('programmers.co.kr') },
    { name: '링크드인', weight: 50, isDedicated: false, check: () => domain.includes('linkedin.com') },
    { name: '점핏', weight: 50, isDedicated: false, check: () => domain.includes('jumpit.co.kr') },

    // 4순위: 잡코리아 (타이틀에 "진행 중인 공고 총 n건" 패턴이 있으면 우선순위 상승)
    {
      name: '잡코리아',
      isDedicated: false,
      weight: (() => {
        if (!domain.includes('jobkorea.co.kr')) return 40;

        // 타이틀에 "진행 중인 공고 총 n건" 패턴이 있으면 가중치 60
        // "진행 중인 공고 확인하기"는 제외 (공고 없을 확률 높음)
        const hasJobPattern = /진행\s*중인\s*공고\s*총\s*\d+건/.test(title);
        return hasJobPattern ? 60 : 40;
      })(),
      check: () => domain.includes('jobkorea.co.kr')
    },

    // 5순위: 사람인 (타이틀 패턴 우선, 도메인도 체크)
    {
      name: '사람인',
      isDedicated: false,
      weight: (() => {
        if (!domain.includes('saramin.co.kr')) return 35;

        // 타이틀에 "진행 중인 공고 총 n건" 패턴이 있으면 가중치 60으로 상승
        const hasSaraminPattern = /진행\s*중인\s*공고\s*총?\s*\d+건/.test(title);
        return hasSaraminPattern ? 60 : 35;
      })(),
      check: () => domain.includes('saramin.co.kr')
    },

    // 기타 (공고없음 판별용)
    { name: 'Other', weight: 10, isDedicated: false, check: () => true }
  ];

  // 첫 번째로 매치되는 플랫폼 반환
  for (const platform of platforms) {
    if (platform.check()) {
      return {
        name: platform.name,
        weight: platform.weight,
        isDedicated: platform.isDedicated || false,
        domain: domain
      };
    }
  }

  return { name: 'Unknown', weight: 0, isDedicated: false, domain: domain };
}

// 여러 플랫폼 중 메인 플랫폼 결정 (검색 순위 기반 가중치)
function determineMainPlatform(urlResults, companyInfo) {
  if (!urlResults || urlResults.length === 0) {
    return { platform: 'None', weight: 0, count: 0 };
  }

  // 각 URL의 플랫폼 식별 (타이틀 정보 포함)
  const platforms = urlResults.map(({ url, title }, index) => ({
    ...identifyPlatform(url, companyInfo, title || ''),
    rank: index + 1  // 검색 순위 (1부터 시작)
  }));

  // 전용 플랫폼이 있는지 먼저 확인
  const dedicatedPlatform = platforms.find(p => p.isDedicated);
  if (dedicatedPlatform) {
    // 전용 플랫폼 발견 시 즉시 반환
    const platformInfo = platforms.filter(p => p.name === dedicatedPlatform.name);
    return {
      platform: dedicatedPlatform.name,
      weight: dedicatedPlatform.weight,
      count: platformInfo.length,
      score: dedicatedPlatform.weight * 1.0, // 전용 플랫폼은 항상 최고 점수
      bestRank: Math.min(...platformInfo.map(p => p.rank)),
      allPlatforms: [{
        name: dedicatedPlatform.name,
        weight: dedicatedPlatform.weight,
        count: platformInfo.length,
        score: dedicatedPlatform.weight * 1.0,
        bestRank: Math.min(...platformInfo.map(p => p.rank)),
        domains: [...new Set(platformInfo.map(p => p.domain))]
      }]
    };
  }

  // 전용 플랫폼이 없으면 기존 로직 수행
  // 플랫폼별 최고 순위만 집계 (중복 제거)
  const platformStats = {};
  platforms.forEach(({ name, weight, domain, rank, isDedicated }) => {
    if (!platformStats[name]) {
      platformStats[name] = {
        name,
        weight,
        bestRank: rank,
        count: 0,
        domains: new Set(),
        isDedicated: isDedicated || false
      };
    }

    // 더 높은 순위(낮은 숫자)가 나오면 업데이트
    if (rank < platformStats[name].bestRank) {
      platformStats[name].bestRank = rank;
    }

    platformStats[name].count++;
    platformStats[name].domains.add(domain);
  });

  // 최고 순위 기반 점수 계산 및 정렬
  const rankedPlatforms = Object.values(platformStats)
    .map(stat => {
      // 검색 순위 기반 가중치: 1위 = 1.0, 2위 = 0.9, ..., 10위 = 0.1
      const rankMultiplier = Math.max(1.1 - (stat.bestRank * 0.1), 0.1);
      const score = stat.weight * rankMultiplier;

      return {
        ...stat,
        score,
        domains: Array.from(stat.domains)
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.bestRank - b.bestRank; // 점수 같으면 더 높은 순위가 우선
    });

  const mainPlatform = rankedPlatforms[0];

  // '사람인 의심' 또는 '공고없음' 판별
  const hasSaramin = platforms.some(p => p.name === '사람인');

  // 메인 플랫폼이 Other이고 사람인 링크가 있으면 → '사람인 의심'
  if (mainPlatform.name === 'Other' && hasSaramin) {
    return {
      platform: '사람인 의심',
      weight: 35,
      count: platformStats['사람인']?.count || 0,
      score: 35,
      bestRank: platformStats['사람인']?.bestRank || 999,
      allPlatforms: rankedPlatforms
    };
  }

  // 메인 플랫폼이 Other이고 사람인 링크도 없으면 → '공고없음'
  if (mainPlatform.name === 'Other') {
    return {
      platform: '공고없음',
      weight: 0,
      count: 0,
      score: 0,
      allPlatforms: rankedPlatforms
    };
  }

  return {
    platform: mainPlatform.name,
    weight: mainPlatform.weight,
    count: mainPlatform.count,
    score: mainPlatform.score,
    allPlatforms: rankedPlatforms
  };
}

// MD 파일에서 회사 리스트 읽기
async function readCompaniesFromMD(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    // 각 줄을 회사명으로 처리, 빈 줄과 # 로 시작하는 주석 제외
    const companies = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !line.startsWith('-'))
      .map(line => line.replace(/^[-*]\s*/, '')) // 리스트 마커 제거
      .map(line => {
        // 형식 1: "회사명|도메인" (예: 큐리오시스|curiosis.co.kr)
        if (line.includes('|')) {
          const [name, domain] = line.split('|').map(part => part.trim());
          return { name, domain };
        }
        // 형식 2: "회사명" (예: 네이버)
        return { name: line, domain: null };
      });

    return companies;
  } catch (error) {
    console.error('회사 리스트 파일을 읽는 중 오류 발생:', error.message);
    throw error;
  }
}

// 구글 검색 수행 및 결과 URL 추출
async function searchCompanyJobs(page, companyInfo) {
  try {
    const companyName = typeof companyInfo === 'string' ? companyInfo : companyInfo.name;
    const searchQuery = `${companyName} 채용`;
    console.log(`🔍 검색 중: "${searchQuery}"`);

    // 구글 홈페이지로 이동
    await page.goto('https://www.google.com', { waitUntil: 'networkidle' });

    // 검색창 찾기 및 검색어 입력
    const searchBox = await page.locator('textarea[name="q"]').first();
    await searchBox.click();
    await searchBox.fill(searchQuery);
    await searchBox.press('Enter');

    // 검색 결과 로딩 대기
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // 추가 대기

    // 검색 결과 URL과 타이틀 추출
    const results = await page.locator('#search').evaluate(searchDiv => {
      const items = [];
      const links = searchDiv.querySelectorAll('a');

      links.forEach(link => {
        const href = link.href;
        if (!href || href.includes('google.com') || href.includes('youtube.com') || !href.startsWith('http')) {
          return;
        }

        // 타이틀 찾기 (h3 태그 또는 부모 요소에서)
        let title = '';
        const h3 = link.querySelector('h3');
        if (h3) {
          title = h3.innerText || h3.textContent || '';
        } else {
          // h3가 없으면 링크 텍스트 사용
          title = link.innerText || link.textContent || '';
        }

        items.push({ url: href, title: title.trim() });
      });

      return items;
    });

    // URL 기준 중복 제거 및 상위 10개만 추출
    const seenUrls = new Set();
    const uniqueResults = results
      .filter(item => {
        if (seenUrls.has(item.url)) return false;
        seenUrls.add(item.url);
        return true;
      })
      .slice(0, 10);

    // 도메인 추출
    const urlData = uniqueResults.map(({ url, title }) => {
      try {
        const domain = new URL(url).hostname;
        return { url, domain, title };
      } catch {
        return { url, domain: 'unknown', title };
      }
    });

    // 메인 채용 플랫폼 결정
    const mainPlatformInfo = determineMainPlatform(urlData, companyInfo);

    console.log(`✅ ${companyName}: ${uniqueResults.length}개 URL 추출 완료 - 메인 플랫폼: ${mainPlatformInfo.platform}`);

    return {
      company: companyName,
      searchQuery,
      timestamp: new Date().toISOString(),
      resultCount: uniqueResults.length,
      mainPlatform: mainPlatformInfo.platform,
      platformScore: mainPlatformInfo.score,
      platformDetails: mainPlatformInfo.allPlatforms,
      results: urlData
    };

  } catch (error) {
    const companyName = typeof companyInfo === 'string' ? companyInfo : companyInfo.name;
    console.error(`❌ ${companyName} 검색 중 오류:`, error.message);
    return {
      company: companyName,
      searchQuery: `${companyName} 채용`,
      timestamp: new Date().toISOString(),
      error: error.message,
      mainPlatform: 'error',
      platformScore: 0,
      platformDetails: [],
      results: []
    };
  }
}

// 결과를 JSON 파일로 저장
async function saveResults(results, outputPath) {
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n💾 결과 저장 완료: ${outputPath}`);
}

// 결과를 CSV 파일로도 저장
async function saveResultsAsCSV(results, outputPath) {
  const rows = [['회사명', '메인 채용 플랫폼', '플랫폼 점수', '검색어', 'URL', '도메인', '타이틀', '타임스탬프']];

  results.forEach(result => {
    if (result.results && result.results.length > 0) {
      result.results.forEach(({ url, domain, title }) => {
        rows.push([
          result.company,
          result.mainPlatform || 'Unknown',
          result.platformScore || 0,
          result.searchQuery,
          url,
          domain,
          title || '',
          result.timestamp
        ]);
      });
    } else {
      rows.push([
        result.company,
        result.mainPlatform || 'None',
        result.platformScore || 0,
        result.searchQuery,
        result.error || 'No results',
        '',
        '',
        result.timestamp
      ]);
    }
  });

  const csv = rows.map(row => row.map(cell => '"' + cell + '"').join(',')).join('\n');
  await fs.writeFile(outputPath, csv, 'utf-8');
  console.log(`💾 CSV 저장 완료: ${outputPath}`);
}

// 회사별 메인 플랫폼 요약 CSV 저장
async function saveCompanyPlatformSummary(results, outputPath) {
  const rows = [['회사명', '메인 채용 플랫폼', '플랫폼 점수', '검색 결과 수', '전체 플랫폼 리스트']];

  results.forEach(result => {
    const platformList = result.platformDetails
      ? result.platformDetails.map(p => `${p.name}(${p.count})`).join(', ')
      : '';

    rows.push([
      result.company,
      result.mainPlatform || 'None',
      result.platformScore || 0,
      result.resultCount || 0,
      platformList
    ]);
  });

  const csv = rows.map(row => row.map(cell => '"' + cell + '"').join(',')).join('\n');
  await fs.writeFile(outputPath, csv, 'utf-8');
  console.log(`💾 회사별 플랫폼 요약 저장 완료: ${outputPath}`);
}

// 플랫폼별 통계 생성 (메인 플랫폼 기준)
function generatePlatformStats(results) {
  const mainPlatformCount = {};

  results.forEach(result => {
    const platform = result.mainPlatform || 'Unknown';
    mainPlatformCount[platform] = (mainPlatformCount[platform] || 0) + 1;
  });

  // 플랫폼별 정렬
  const sortedPlatforms = Object.entries(mainPlatformCount)
    .sort((a, b) => b[1] - a[1]);

  console.log('\n📊 메인 채용 플랫폼 통계 (회사 수 기준):');
  console.log('='.repeat(60));
  sortedPlatforms.forEach(([platform, count], index) => {
    const percentage = ((count / results.length) * 100).toFixed(1);
    console.log(`${index + 1}. ${platform}: ${count}개 회사 (${percentage}%)`);
  });
  console.log('='.repeat(60));

  return mainPlatformCount;
}

// 메인 함수
async function main() {
  const startTime = Date.now(); // 시작 시간 기록
  const outputDir = 'results';

  // 명령행 인수에서 --start와 --count 파싱
  let startIndex = 0;
  let count = null; // null이면 전체 실행
  let companiesFile = 'companies.md';

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--start' && process.argv[i + 1]) {
      startIndex = parseInt(process.argv[i + 1]);
      i++; // 다음 인수 스킵
    } else if (process.argv[i] === '--count' && process.argv[i + 1]) {
      count = parseInt(process.argv[i + 1]);
      i++; // 다음 인수 스킵
    } else if (!process.argv[i].startsWith('--')) {
      // 옵션이 아닌 경우 파일명으로 간주
      companiesFile = process.argv[i];
    }
  }

  console.log('🚀 Google 채용 크롤러 시작');
  console.log(`📄 회사 리스트 파일: ${companiesFile}`);
  if (count !== null) {
    console.log(`📍 범위: ${startIndex}번째부터 ${count}개\n`);
  } else {
    console.log(`📍 범위: 전체\n`);
  }

  // 결과 디렉토리 생성
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    // 디렉토리가 이미 존재하는 경우 무시
  }

  // 회사 리스트 읽기
  let companies = await readCompaniesFromMD(companiesFile);
  console.log(`📋 전체 ${companies.length}개 회사`);

  // 범위 지정된 경우 슬라이싱
  if (count !== null) {
    companies = companies.slice(startIndex, startIndex + count);
    console.log(`✂️  이번 실행: ${companies.length}개 회사 (${startIndex}~${startIndex + companies.length - 1})\n`);
  } else {
    console.log(`✂️  이번 실행: 전체 ${companies.length}개 회사\n`);
  }

  if (companies.length === 0) {
    console.error('❌ 크롤링할 회사가 없습니다.');
    return;
  }

  // 브라우저 실행 (헤드리스 모드 끄기)
  const browser = await chromium.launch({
    headless: false,  // 실제 브라우저 창 표시
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR'
  });

  const page = await context.newPage();

  // 기존 results_temp.json 파일 읽기 (있으면)
  const tempOutputPath = path.join(outputDir, 'results_temp.json');
  const progressPath = path.join(outputDir, 'progress.json');
  let existingResults = [];
  let existingResultsMap = new Map();
  let processedCompanies = new Set(); // 이미 크롤링한 회사 목록

  try {
    const tempData = await fs.readFile(tempOutputPath, 'utf-8');
    const tempJson = JSON.parse(tempData);
    // 메타데이터가 있는 경우와 없는 경우 모두 처리
    existingResults = tempJson.results || tempJson;

    // 회사명을 키로 하는 Map 생성 (중복 체크용)
    existingResults.forEach(result => {
      existingResultsMap.set(result.company, result);
      processedCompanies.add(result.company);
    });

    console.log(`📦 기존 데이터 로드: ${existingResults.length}개 회사\n`);
  } catch (error) {
    console.log(`📦 새로 시작 (기존 데이터 없음)\n`);
  }

  // 진행상황 파일 읽기 (이어서 하기용)
  let lastProcessedIndex = -1;
  try {
    const progressData = await fs.readFile(progressPath, 'utf-8');
    const progress = JSON.parse(progressData);
    lastProcessedIndex = progress.lastIndex || -1;

    if (lastProcessedIndex >= 0) {
      console.log(`🔄 이전 진행 발견: ${lastProcessedIndex + 1}번째 회사까지 완료`);
      console.log(`📍 ${lastProcessedIndex + 1}번째부터 이어서 시작합니다.\n`);
    }
  } catch (error) {
    // 진행상황 파일이 없으면 처음부터 시작
  }

  const allResults = [];

  try {
    // ========================================
    // CAPTCHA 워밍업: 첫 검색으로 CAPTCHA 트리거
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('🔥 CAPTCHA 워밍업 단계 시작');
    console.log('='.repeat(60));
    console.log('📌 더미 검색을 수행하여 CAPTCHA를 트리거합니다...\n');

    // 구글 홈페이지로 이동
    await page.goto('https://www.google.com', { waitUntil: 'networkidle' });

    // 더미 검색 수행
    const warmupSearchBox = await page.locator('textarea[name="q"]').first();
    await warmupSearchBox.click();
    await warmupSearchBox.fill('테스트 검색');
    await warmupSearchBox.press('Enter');

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n' + '⚠️ '.repeat(30));
    console.log('⚠️  CAPTCHA가 나타났다면 지금 풀어주세요!  ⚠️');
    console.log('⚠️ '.repeat(30));
    console.log('\n⏰ 60초 대기 시작...\n');

    // 60초 카운트다운
    for (let countdown = 60; countdown > 0; countdown--) {
      if (countdown % 10 === 0 || countdown <= 5) {
        console.log(`⏳ ${countdown}초 남음...`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '🔔 '.repeat(30));
    console.log('🔔  CAPTCHA를 풀었다면 Enter 키를 눌러주세요!  🔔');
    console.log('🔔  (아직 풀지 못했다면 풀고 Enter를 눌러주세요)  🔔');
    console.log('🔔 '.repeat(30) + '\n');

    // 사용자 입력 대기 (Enter 키)
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

    console.log('\n✅ 확인 완료! 실제 검색을 시작합니다.\n');
    console.log('='.repeat(60) + '\n');

    // ========================================
    // 실제 회사 검색 시작
    // ========================================
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const companyName = typeof company === 'string' ? company : company.name;

      // 이미 처리된 회사는 건너뛰기 (이어서 하기)
      if (i <= lastProcessedIndex) {
        console.log(`\n[${i + 1}/${companies.length}] ⏭️  건너뜀: ${companyName} (이미 완료)`);
        continue;
      }

      console.log(`\n[${i + 1}/${companies.length}] 처리 중...`);

      // 검색 수행
      const result = await searchCompanyJobs(page, company);
      allResults.push(result);

      // 기존 데이터에 병합 (덮어쓰기) + 변경 감지
      const existingData = existingResultsMap.get(result.company);
      if (existingData && existingData.mainPlatform && existingData.mainPlatform !== result.mainPlatform) {
        // 메인 플랫폼 변경 감지
        result.platformChanged = true;
        result.previousPlatform = existingData.mainPlatform;
        result.changedAt = new Date().toISOString();
        console.log(`  ⚠️  플랫폼 변경 감지: ${existingData.mainPlatform} → ${result.mainPlatform}`);
      } else if (existingData && existingData.platformChanged) {
        // 기존 변경 플래그 유지
        result.platformChanged = existingData.platformChanged;
        result.previousPlatform = existingData.previousPlatform;
        result.changedAt = existingData.changedAt;
      }

      existingResultsMap.set(result.company, result);

      // 중간 저장 (10개마다) + 진행상황 저장
      if ((i + 1) % 10 === 0) {
        // Map을 배열로 변환하여 저장
        const mergedResults = Array.from(existingResultsMap.values());
        const tempData = {
          metadata: {
            totalCompanies: mergedResults.length,
            crawledAt: new Date().toISOString()
          },
          results: mergedResults
        };
        await saveResults(tempData, tempOutputPath);

        // 진행상황 저장
        const progressData = {
          lastIndex: i,
          lastCompany: companyName,
          timestamp: new Date().toISOString()
        };
        await fs.writeFile(progressPath, JSON.stringify(progressData, null, 2), 'utf-8');

        console.log(`💾 중간 저장 완료 (누적: ${mergedResults.length}개, 이번 실행: ${i + 1}/${companies.length})`);
      }

      // 마지막 검색이 아니면 랜덤 지연
      if (i < companies.length - 1) {
        await randomDelay();
      }
    }

    // 최종 병합 결과
    const mergedResults = Array.from(existingResultsMap.values());

    // 최종 results_temp.json 저장 (웹사이트용)
    const finalTempData = {
      metadata: {
        totalCompanies: mergedResults.length,
        crawledAt: new Date().toISOString()
      },
      results: mergedResults
    };
    await saveResults(finalTempData, tempOutputPath);

    // 타임스탬프별 백업 저장
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const jsonOutputPath = path.join(outputDir, `results_${timestamp}.json`);
    const csvOutputPath = path.join(outputDir, `results_${timestamp}.csv`);
    const summaryOutputPath = path.join(outputDir, `company_platform_summary_${timestamp}.csv`);

    // 소요 시간 계산 (저장용)
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const durationSeconds = Math.floor(durationMs / 1000);

    // 이번 실행 결과만 타임스탬프 파일로 백업
    const resultsWithMeta = {
      metadata: {
        totalCompanies: allResults.length,
        crawledAt: new Date().toISOString(),
        durationMs: durationMs,
        durationSeconds: durationSeconds,
        averageSecondsPerCompany: (durationSeconds / allResults.length).toFixed(2)
      },
      results: allResults
    };

    await saveResults(resultsWithMeta, jsonOutputPath);
    await saveResultsAsCSV(allResults, csvOutputPath);
    await saveCompanyPlatformSummary(allResults, summaryOutputPath);

    // 전체 데이터 기준 플랫폼 통계 생성 및 저장
    const platformStats = generatePlatformStats(mergedResults);
    const statsOutputPath = path.join(outputDir, `platform_stats_${timestamp}.json`);
    await fs.writeFile(statsOutputPath, JSON.stringify(platformStats, null, 2), 'utf-8');

    // 소요 시간 콘솔 출력
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;

    console.log('\n' + '='.repeat(60));
    console.log('✨ 크롤링 완료!');
    console.log('='.repeat(60));
    console.log(`📊 이번 실행: ${allResults.length}개 회사 크롤링`);
    console.log(`📦 누적 데이터: ${mergedResults.length}개 회사`);
    console.log(`⏱️  소요 시간: ${minutes}분 ${seconds}초 (총 ${durationSeconds}초)`);
    console.log(`📈 평균 검색 속도: ${(durationSeconds / allResults.length).toFixed(1)}초/회사`);
    console.log('='.repeat(60));
    console.log(`\n💡 웹사이트용 파일: results/results_temp.json (${mergedResults.length}개 회사)`);

    // 모든 작업이 완료되면 진행상황 파일 삭제
    try {
      await fs.unlink(progressPath);
      console.log('🗑️  진행상황 파일 삭제 완료\n');
    } catch (error) {
      // 파일이 없으면 무시
    }

  } catch (error) {
    console.error('❌ 크롤링 중 오류 발생:', error);
    // 오류 발생 시에도 현재까지의 결과 저장
    const errorOutputPath = path.join(outputDir, 'results_error.json');
    await saveResults(allResults, errorOutputPath);
  } finally {
    await browser.close();
    console.log('\n👋 브라우저 종료');
  }
}

// 실행
main().catch(console.error);
