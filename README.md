# Google Job Crawler

Playwright를 사용한 구글 채용 정보 크롤러입니다. Stealth 모드를 활용하여 회사별 채용 공고 URL을 수집하고, 어떤 채용 플랫폼이 사용되는지 분석합니다.

## 주요 기능

- 🔍 구글 검색을 통한 채용 정보 수집
- 🥷 Stealth 모드로 봇 감지 최소화
- ⏱️ 랜덤 지연 (2-5초)으로 자연스러운 검색 패턴
- 💾 JSON 및 CSV 형식으로 결과 저장
- 📊 채용 플랫폼별 통계 자동 생성
- 🔄 중간 저장 기능 (10개마다 자동 저장)

## 설치 방법

1. 의존성 패키지 설치:
```bash
npm install
```

2. Playwright 브라우저 설치:
```bash
npm run install-browser
```

## 사용 방법

### 1. 회사 리스트 준비

`companies.md` 파일에 검색할 회사 이름을 한 줄에 하나씩 입력합니다:

```markdown
# 회사 리스트

삼성전자	https://www.samsung.com
LG전자	https://www.lge.co.kr
SK하이닉스	https://www.skhynix.com
```

- 형식: `회사명[TAB]URL`
- `#`로 시작하는 줄은 주석으로 무시됩니다
- `-`로 시작하는 줄도 무시됩니다
- 빈 줄은 자동으로 제외됩니다

### 2. 크롤러 실행

#### 전체 실행 (권장하지 않음)
```bash
node crawler.js
```

#### 범위 지정 실행 (권장)
```bash
# 0번째부터 100개
node crawler.js --start 0 --count 100

# 100번째부터 100개
node crawler.js --start 100 --count 100

# 200번째부터 100개
node crawler.js --start 200 --count 100
```

#### 크롤링 + 자동 업로드
```bash
# 크롤링 후 GitHub에 자동 업로드
./crawl-and-upload.sh --start 0 --count 100
```

#### 이어서 하기
크롤링 중 에러나 CAPTCHA로 중단된 경우, 같은 명령어로 다시 실행하면 자동으로 이어서 시작합니다:
```bash
# 중단된 지점부터 자동으로 재개
node crawler.js --start 0 --count 100
```

### 3. 추가 유틸리티

#### 기존 데이터 재분석
새로운 분류 로직을 적용하여 크롤링 없이 기존 데이터를 재분석:
```bash
node reanalyze.js
```

#### 플랫폼 변경 플래그 초기화
확인 완료 후 변경 경고를 모두 제거:
```bash
node clear-changes.js
```

#### 웹사이트만 업데이트
```bash
./update-website.sh
```

### 4. 결과 확인

실행이 완료되면 `results/` 디렉토리에 다음 파일들이 생성됩니다:

- `results_temp.json` - 웹사이트용 누적 데이터 (자동 병합)
- `results_YYYY-MM-DDTHH-MM-SS.json` - 타임스탬프별 백업 (JSON)
- `results_YYYY-MM-DDTHH-MM-SS.csv` - 검색 결과 (CSV)
- `company_platform_summary_YYYY-MM-DDTHH-MM-SS.csv` - 회사별 요약
- `platform_stats_YYYY-MM-DDTHH-MM-SS.json` - 플랫폼별 통계
- `progress.json` - 진행상황 (중단 시 이어하기용)

## 결과 파일 형식

### JSON 결과 예시
```json
[
  {
    "company": "네이버",
    "searchQuery": "네이버 채용",
    "timestamp": "2024-12-12T10:30:00.000Z",
    "resultCount": 10,
    "results": [
      {
        "url": "https://recruit.navercorp.com/",
        "domain": "recruit.navercorp.com"
      },
      {
        "url": "https://www.saramin.co.kr/...",
        "domain": "www.saramin.co.kr"
      }
    ]
  }
]
```

### CSV 결과 예시
```csv
"회사명","검색어","URL","도메인","타임스탬프"
"네이버","네이버 채용","https://recruit.navercorp.com/","recruit.navercorp.com","2024-12-12T10:30:00.000Z"
"네이버","네이버 채용","https://www.saramin.co.kr/...","www.saramin.co.kr","2024-12-12T10:30:00.000Z"
```

### 플랫폼 통계 예시
```json
{
  "www.saramin.co.kr": 150,
  "www.wanted.co.kr": 120,
  "www.jobkorea.co.kr": 95,
  "recruit.navercorp.com": 45
}
```

## 크롤링 속도 및 안전성

- **랜덤 지연**: 각 검색마다 2-5초의 랜덤 지연
- **Stealth 모드**: playwright-extra + puppeteer-extra-plugin-stealth 사용
- **헤드리스 모드 꺼짐**: 실제 브라우저 창이 표시됨
- **중간 저장**: 10개마다 자동으로 결과 저장
- **권장 속도**:
  - 소규모 테스트: 10-20개 회사
  - 중규모: 50-100개 회사
  - 대규모 (2000개): 여러 번에 나눠서 실행 권장

## 주의사항

⚠️ **법적 및 윤리적 고려사항**

1. **구글 서비스 약관**: 자동화된 검색은 구글의 서비스 약관을 위반할 수 있습니다
2. **교육 목적**: 이 도구는 개인 학습 및 연구 목적으로만 사용하세요
3. **상업적 사용 금지**: 상업적 목적으로 사용하지 마세요
4. **Rate Limiting**: 과도한 요청은 IP 차단을 초래할 수 있습니다
5. **공식 API 권장**: 프로덕션 환경에서는 Google Custom Search API 사용을 권장합니다

⚠️ **봇 감지 가능성**

- 2000개의 회사를 한 번에 검색하면 봇 감지될 가능성이 높습니다
- CAPTCHA가 나타날 수 있습니다
- IP 기반 rate limiting이 적용될 수 있습니다

**권장 방법**:
- 처음에는 10-20개로 테스트
- 문제가 없으면 점진적으로 증가
- 2000개는 여러 날에 나눠서 실행
- 하루에 200-300개 정도가 안전

## 웹사이트 대시보드

크롤링 데이터를 시각화하는 정적 웹사이트가 포함되어 있습니다.

### 배포된 사이트
🌐 **https://jintaepark723.github.io/job-platform-dashboard/website/**

### 주요 기능
- 📊 플랫폼별 분포 차트 (파이차트, 바차트)
- 🔍 차트 클릭으로 플랫폼별 회사 필터링
- ⚠️ 플랫폼 변경 감지 및 경고 표시
- 🕐 마지막 업데이트 시간 표시
- 📱 반응형 디자인 (Tailwind CSS)

### 플랫폼 변경 감지
재크롤링 시 메인 플랫폼이 변경된 회사를 자동으로 감지하여 표시합니다:
- 회사명 옆에 `⚠️ 플랫폼 변경 확인필요` 배지 표시
- 이전 플랫폼 정보 표시
- 노란색 배경으로 강조

### 로컬에서 테스트
```bash
# Python 서버 실행
python3 -m http.server 8000

# 브라우저에서 접속
open http://localhost:8000/website/
```

### GitHub Pages 배포
```bash
# 데이터 업데이트 후 자동 배포
./update-website.sh

# 또는 수동 배포
git add results/results_temp.json website/
git commit -m "Update data"
git push origin main
```

## 기술 스택

### 크롤러
- **Playwright**: 브라우저 자동화
- **playwright-extra**: Playwright 확장 플러그인 지원
- **puppeteer-extra-plugin-stealth**: 봇 감지 회피
- **Node.js**: ES Modules 사용

### 웹사이트
- **HTML5/CSS3**: 정적 웹사이트
- **Tailwind CSS**: 스타일링 (CDN)
- **Chart.js**: 데이터 시각화
- **Vanilla JavaScript**: 인터랙션
- **GitHub Pages**: 무료 호스팅

## 문제 해결

### CAPTCHA가 나타나는 경우
- 검색 간격을 더 늘리세요 (5-10초)
- 하루에 처리하는 회사 수를 줄이세요
- VPN을 사용하거나 IP를 변경하세요

### 검색 결과가 없는 경우
- 회사명이 정확한지 확인하세요
- 네트워크 연결을 확인하세요
- 구글이 일시적으로 차단했을 수 있습니다

### 브라우저가 실행되지 않는 경우
```bash
npm run install-browser
```

## 라이선스

개인 및 교육 목적으로만 사용하세요.
