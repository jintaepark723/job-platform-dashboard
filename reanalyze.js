import fs from 'fs/promises';
import path from 'path';

// crawler.js에서 필요한 함수들을 복사
function isCompanyDomain(domain, companyName, registeredDomain = null) {
  if (registeredDomain && domain.includes(registeredDomain)) {
    return true;
  }

  const cleanDomain = domain.replace(/\.(co\.kr|com|net|org|ai|io)$/i, '');
  const companyKeyword = companyName.toLowerCase().replace(/\s+/g, '');

  return cleanDomain.includes(companyKeyword) || companyKeyword.includes(cleanDomain);
}

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

  const platforms = [
    // SPAC (최우선)
    {
      name: 'SPAC',
      weight: 100,
      isDedicated: true,
      check: () => {
        const spacKeywords = ['스팩', 'spac', '기업인수목적'];
        return spacKeywords.some(keyword => companyName.toLowerCase().includes(keyword));
      }
    },

    // 1순위: 대기업 그룹 통합 채용 사이트 (가중치: 95)
    {
      name: '그룹채용',
      weight: 95,
      isDedicated: true,
      check: () => {
        const groupRecruitDomains = [
          'samsungcareers.com', 'samsung.com/sec/about-us/careers',
          'samsung-dsrecruit.com', 'samsung-dxrecruit.com',
          'careers.lg.com',
          'skcareers.com',
          'careers.kakao.com',
          'talent.hyundai.com', 'careers.hyundaigroup.com',
          'hyundai.co.kr/recruit', 'hyundai-autoever.com',
          'recruit.hd.com',
          'hanwhain.com',
          'recruit.lotte.co.kr',
          'cj.net/career', 'cjcareers.com',
          'recruit.posco.com', 'poscorecruit.careerlink.kr',
          'poscorecruit.com', 'gorecruit.posco.co.kr',
          'gs.co.kr/recruit', 'gscareers.com',
          'career.doosan.com',
          'recruit.kt.com',
          'lsholdings.com/ko/careers', 'lsholdings.careerlink.kr',
          'hyosung.recruiter.co.kr',
          'hanjinkal.co.kr/kr/communityid/75',
          'dream.kolon.com', 'recruit.kolonfnc.com',
          'recruit.kkpc.com', 'kkpc-recruit',
          'with.nonghyup.com', 'nhreits.com', 'nhbank.com',
          'career.miraeasset.com',
          'careers.kbfg.com', 'jobs.kbstar.com',
          'shinhan.recruiter.co.kr', 'recruit.shinhansec.com', 'recruit.shinhaninvest.com',
          'hanafn.com', 'hanati.recruiter.co.kr', 'hanabank.recruiter.co.kr',
          'woorifg.com', 'wooribank.careerlink.kr',
          'job.shinsegae.com',
          'bgf.recruiter.co.kr',
          'dlenc.recruiter.co.kr', 'daelim.co.kr',
          'oci.career.greetinghr.com'
        ];

        const isDomainMatch = groupRecruitDomains.some(recruitDomain => domain.includes(recruitDomain));

        const groupTitleKeywords = [
          '그룹 채용', '그룹채용', '그룹 인재', '그룹인재',
          '통합 채용', '통합채용', '채용사이트', '채용 사이트',
          'group career', 'group recruit', 'group hiring',
          '계열사 채용', '계열사채용'
        ];
        const hasTitleKeyword = groupTitleKeywords.some(keyword =>
          titleLower.includes(keyword.toLowerCase())
        );

        return isDomainMatch || hasTitleKeyword;
      }
    },

    // 2순위: 자체 개발 채용 사이트
    {
      name: '자체',
      weight: 90,
      isDedicated: true,
      check: () => {
        if (!isCompanyDomain(domain, companyName, registeredDomain)) {
          return false;
        }
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

    // 전용 HR 플랫폼들
    {
      name: '그리팅',
      weight: 80,
      isDedicated: true,
      check: () => domain.includes('greetinghr.com')
    },
    {
      name: '나인하이어',
      weight: 80,
      isDedicated: true,
      check: () => domain.includes('9hire.com')
    },

    // 주요 채용 플랫폼
    {
      name: '원티드',
      isDedicated: false,
      weight: 50,
      check: () => domain.includes('wanted.co.kr')
    },
    {
      name: '로켓펀치',
      isDedicated: false,
      weight: 50,
      check: () => domain.includes('rocketpunch.com')
    },
    {
      name: '프로그래머스',
      isDedicated: false,
      weight: 50,
      check: () => domain.includes('programmers.co.kr')
    },
    {
      name: '링크드인',
      isDedicated: false,
      weight: 50,
      check: () => domain.includes('linkedin.com')
    },
    {
      name: '점핏',
      isDedicated: false,
      weight: 50,
      check: () => domain.includes('jumpit.co.kr')
    },
    {
      name: '마이다스인',
      isDedicated: false,
      weight: 45,
      check: () => domain.includes('midas-i.com')
    },
    {
      name: '잡코리아',
      isDedicated: false,
      weight: (() => {
        if (!domain.includes('jobkorea.co.kr')) return 40;
        const hasJobPattern = /진행\s*중인\s*공고\s*총\s*\d+건/.test(title);
        return hasJobPattern ? 60 : 40;
      })(),
      check: () => domain.includes('jobkorea.co.kr')
    },
    {
      name: '사람인',
      isDedicated: false,
      weight: (() => {
        if (!domain.includes('saramin.co.kr')) return 35;
        const hasSaraminPattern = /진행\s*중인\s*공고\s*총?\s*\d+건/.test(title);
        return hasSaraminPattern ? 60 : 35;
      })(),
      check: () => domain.includes('saramin.co.kr')
    },

    // 기타
    {
      name: 'Other',
      weight: 10,
      isDedicated: false,
      check: () => true
    }
  ];

  for (const platform of platforms) {
    if (platform.check()) {
      return { ...platform, url };
    }
  }

  return { name: 'Other', weight: 10, isDedicated: false, url };
}

function determinePlatform(urlResults, companyInfo) {
  const platforms = urlResults.map(({ url, title }, index) => ({
    ...identifyPlatform(url, companyInfo, title || ''),
    rank: index + 1
  }));

  const dedicatedPlatform = platforms.find(p => p.isDedicated);
  if (dedicatedPlatform) {
    return {
      platform: dedicatedPlatform.name,
      weight: dedicatedPlatform.weight,
      count: 1,
      score: dedicatedPlatform.weight,
      allPlatforms: platforms
    };
  }

  const platformMap = {};
  platforms.forEach(p => {
    if (!platformMap[p.name]) {
      platformMap[p.name] = {
        name: p.name,
        weight: p.weight,
        bestRank: p.rank,
        count: 1,
        domains: [p.url],
        isDedicated: p.isDedicated
      };
    } else {
      platformMap[p.name].count++;
      platformMap[p.name].domains.push(p.url);
      if (p.rank < platformMap[p.name].bestRank) {
        platformMap[p.name].bestRank = p.rank;
      }
    }
  });

  const rankedPlatforms = Object.values(platformMap).map(stat => {
    const rankMultiplier = Math.max(1.1 - (stat.bestRank * 0.1), 0.1);
    const score = stat.weight * rankMultiplier;
    return { ...stat, score };
  });

  rankedPlatforms.sort((a, b) => b.score - a.score);
  const mainPlatform = rankedPlatforms[0];

  const hasSaramin = platforms.some(p => p.name === '사람인');

  if (mainPlatform.name === 'Other' && hasSaramin) {
    return { platform: '사람인 의심', weight: 35, count: 1, score: 35, allPlatforms: rankedPlatforms };
  }

  if (mainPlatform.name === 'Other') {
    return { platform: '공고없음', weight: 0, count: 0, score: 0, allPlatforms: rankedPlatforms };
  }

  return {
    platform: mainPlatform.name,
    weight: mainPlatform.weight,
    count: mainPlatform.count,
    score: mainPlatform.score,
    allPlatforms: rankedPlatforms
  };
}

// 메인 함수
async function reanalyze() {
  console.log('🔄 기존 크롤링 데이터 재분석 시작\n');

  const inputPath = 'results/results_temp.json';
  const outputPath = 'results/results_temp.json';
  const backupPath = `results/results_temp_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`;

  try {
    // 기존 데이터 읽기
    const rawData = await fs.readFile(inputPath, 'utf-8');
    const jsonData = JSON.parse(rawData);
    const results = jsonData.results || jsonData;

    console.log(`📦 로드된 데이터: ${results.length}개 회사\n`);

    // 백업 생성
    await fs.writeFile(backupPath, rawData, 'utf-8');
    console.log(`💾 백업 생성: ${backupPath}\n`);

    // 재분석
    const reanalyzedResults = results.map((result, index) => {
      console.log(`[${index + 1}/${results.length}] ${result.company} 재분석 중...`);

      if (!result.results || result.results.length === 0) {
        console.log(`  ⚠️  검색 결과 없음, 건너뜀`);
        return result;
      }

      const companyInfo = {
        name: result.company.split('\t')[0],
        domain: null
      };

      const urlResults = result.results.map(r => ({
        url: r.url,
        title: r.title || ''
      }));

      const platformResult = determinePlatform(urlResults, companyInfo);

      const updated = {
        ...result,
        mainPlatform: platformResult.platform,
        platformScore: platformResult.score,
        platformDetails: platformResult.allPlatforms
      };

      if (updated.mainPlatform !== result.mainPlatform) {
        console.log(`  🔄 ${result.mainPlatform} → ${updated.mainPlatform}`);
      } else {
        console.log(`  ✓ ${updated.mainPlatform} (변경없음)`);
      }

      return updated;
    });

    // 저장
    const outputData = {
      metadata: {
        totalCompanies: reanalyzedResults.length,
        crawledAt: new Date().toISOString(),
        reanalyzed: true
      },
      results: reanalyzedResults
    };

    await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');

    console.log('\n' + '='.repeat(60));
    console.log('✨ 재분석 완료!');
    console.log('='.repeat(60));
    console.log(`📊 총 ${reanalyzedResults.length}개 회사 재분석 완료`);
    console.log(`💾 저장: ${outputPath}`);
    console.log(`📦 백업: ${backupPath}`);
    console.log('='.repeat(60));

    // 변경 통계
    let changedCount = 0;
    results.forEach((old, i) => {
      if (old.mainPlatform !== reanalyzedResults[i].mainPlatform) {
        changedCount++;
      }
    });
    console.log(`\n📈 플랫폼 변경: ${changedCount}개 회사`);

  } catch (error) {
    console.error('❌ 재분석 실패:', error);
  }
}

reanalyze().catch(console.error);
