/**
 * 알림 체크 워커
 * Sprint 4 - BE 개발자 작성
 *
 * Docker worker 컨테이너에서 실행.
 * CHECK_INTERVAL_MS 간격으로 /api/v1/alerts/check를 호출합니다.
 */
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const WORKER_SECRET = process.env.WORKER_SECRET;
const INTERVAL = parseInt(process.env.CHECK_INTERVAL_MS ?? '60000', 10);

if (!WORKER_SECRET) {
  console.error('[Worker] WORKER_SECRET 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

async function checkAlerts() {
  try {
    const res = await fetch(`${APP_URL}/api/v1/alerts/check`, {
      method: 'POST',
      headers: {
        'x-worker-secret': WORKER_SECRET,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[Worker] 알림 체크 실패 (${res.status}): ${text}`);
      return;
    }

    const data = await res.json();
    if (data.triggered > 0) {
      console.log(`[Worker] ${new Date().toISOString()} — 점검 완료: ${data.checked}개 규칙, ${data.triggered}개 발동`);
    }
  } catch (err) {
    // 앱 컨테이너가 아직 준비되지 않은 경우 등
    console.warn(`[Worker] 연결 오류 (재시도 예정): ${err.message}`);
  }
}

// 즉시 1회 실행 후 인터벌
setTimeout(async () => {
  console.log(`[Worker] 시작 — ${INTERVAL / 1000}초 간격으로 알림 점검`);
  await checkAlerts();
  setInterval(checkAlerts, INTERVAL);
}, 5000); // 앱 시작 대기 5초
