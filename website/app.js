// 전역 변수
let allData = [];
let pieChart = null;
let barChart = null;
let platformStats = {};

// 색상 팔레트
const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16',
    '#6366F1', '#F43F5E', '#0EA5E9', '#A855F7', '#22C55E'
];

// 데이터 로드
async function loadData() {
    try {
        // JSON 파일 경로를 실제 크롤링 결과 파일로 변경하세요
        const response = await fetch('../results/results_temp.json');
        const jsonData = await response.json();

        // 메타데이터가 있는 경우 처리
        if (jsonData.metadata && jsonData.results) {
            allData = jsonData.results;
            updateLastUpdate(jsonData.metadata.crawledAt);
        } else {
            allData = jsonData;
        }

        processData();
        renderCharts();
        updateStats();
    } catch (error) {
        console.error('데이터 로드 실패:', error);
        document.getElementById('total-companies').textContent = '로드 실패';
    }
}

// 데이터 처리
function processData() {
    platformStats = {};

    allData.forEach(company => {
        const platform = company.mainPlatform || 'Unknown';

        // "Error"와 "사람인 의심" 데이터는 제외
        if (platform === 'Error' || platform === 'error' || platform === '사람인 의심') {
            return;
        }

        if (!platformStats[platform]) {
            platformStats[platform] = {
                count: 0,
                companies: []
            };
        }
        platformStats[platform].count++;
        // 회사명에서 URL 부분 제거 (탭으로 구분된 경우)
        const companyName = company.company.split('\t')[0];
        platformStats[platform].companies.push({
            name: companyName,
            platform: platform,
            platformChanged: company.platformChanged || false,
            previousPlatform: company.previousPlatform || null,
            changedAt: company.changedAt || null
        });
    });
}

// 통계 업데이트
function updateStats() {
    // Error와 사람인 의심을 제외한 회사 수 계산
    const validCompanies = allData.filter(company => {
        const platform = company.mainPlatform || 'Unknown';
        return platform !== 'Error' && platform !== 'error' && platform !== '사람인 의심';
    });

    const totalCompanies = validCompanies.length;
    const platformCount = Object.keys(platformStats).length;

    document.getElementById('total-companies').textContent = totalCompanies.toLocaleString();
    document.getElementById('platform-count').textContent = platformCount;
}

// 마지막 업데이트 시간 표시
function updateLastUpdate(timestamp) {
    if (!timestamp) {
        document.getElementById('last-update').textContent = '정보 없음';
        return;
    }

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    let timeText;
    if (diffHours > 24) {
        timeText = `${Math.floor(diffHours / 24)}일 전`;
    } else if (diffHours > 0) {
        timeText = `${diffHours}시간 전`;
    } else if (diffMinutes > 0) {
        timeText = `${diffMinutes}분 전`;
    } else {
        timeText = '방금 전';
    }

    document.getElementById('last-update').textContent = timeText;
}

// 차트 렌더링
function renderCharts() {
    // 플랫폼별 정렬 (회사 수 기준 내림차순)
    const sortedPlatforms = Object.entries(platformStats)
        .sort((a, b) => b[1].count - a[1].count);

    const labels = sortedPlatforms.map(([name]) => name);
    const data = sortedPlatforms.map(([, stats]) => stats.count);
    const backgroundColors = colors.slice(0, labels.length);

    // Pie Chart
    const pieCtx = document.getElementById('platformPieChart').getContext('2d');
    if (pieChart) pieChart.destroy();

    pieChart = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value}개 (${percentage}%)`;
                        }
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const platform = labels[index];
                    showCompanyList(platform);
                }
            }
        }
    });

    // Bar Chart
    const barCtx = document.getElementById('platformBarChart').getContext('2d');
    if (barChart) barChart.destroy();

    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '회사 수',
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y}개 회사`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const platform = labels[index];
                    showCompanyList(platform);
                }
            }
        }
    });
}

// 회사 리스트 표시
function showCompanyList(platform) {
    const section = document.getElementById('company-list-section');
    const platformName = document.getElementById('selected-platform-name');
    const filteredCount = document.getElementById('filtered-count');
    const tbody = document.getElementById('company-table-body');

    const companies = platformStats[platform]?.companies || [];

    platformName.textContent = platform;
    filteredCount.textContent = companies.length;

    // 테이블 내용 생성
    tbody.innerHTML = companies.map((company, index) => {
        const changedBadge = company.platformChanged ?
            `<span class="ml-2 px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-800" title="이전: ${company.previousPlatform}">⚠️ 플랫폼 변경 확인필요</span>` : '';

        return `
        <tr class="hover:bg-gray-50 ${company.platformChanged ? 'bg-yellow-50' : ''}">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${index + 1}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                ${company.name}
                ${changedBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    ${company.platform}
                </span>
                ${company.platformChanged ? `<div class="text-xs text-gray-500 mt-1">이전: ${company.previousPlatform}</div>` : ''}
            </td>
        </tr>
        `;
    }).join('');

    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 필터 초기화
function clearFilter() {
    const section = document.getElementById('company-list-section');
    section.classList.add('hidden');
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
    loadData();
});
