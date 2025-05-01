/**
 * script.js
 * 현장조사 웹앱 전체 로직
 *
 * 핵심 기능:
 *  - 위치 수집 (카운트다운 + 확인창)
 *  - 도로명주소 변환 (Kakao REST API)
 *  - GeoJSON 및 사진 저장
 *     • Android: 자동 다운로드
 *     • iOS: Web Share API 를 통한 공유 시트
 *  - 지도 표시 (Kakao Maps API)
 *     • 마커, 텍스트 오버레이, 클러스터링
 *     • “내 위치” 버튼
 *  - GeoJSON 분석 대시보드 (Chart.js + jsPDF)
 */

// 🔐 **REST API 키** 설정
//  • Kakao developers 에서 발급받은 “REST API Key”를 넣어야
//  • getAddressFromCoords() 호출 시 헤더에 사용.
const KAKAO_API_KEY = "54334f6c1b1b42b6a57c2f4cb470cf2a";

// 전역 변수 선언
let map, clusterer, watchId;
let positions = [];             // 위치 수신 데이터를 저장
let colorIndex = 0;             // 마커 색상 순환 인덱스
const colors = ["blue","green","orange","purple","black","brown","magenta"];
let globalSummary = {}, globalResults = [];  // 분석 리포트용 데이터

/**
 * isIOS()
 * --------------------------
 * iOS 기기인지 확인.
 * 왜? iOS Safari/Chrome은 자동 다운로드를 지원하지 않으므로
 * Web Share API 를 사용해 “공유 시트”를 띄워야 하기 때문.
 */
function isIOS() {
  return /iP(hone|od|ad)/.test(navigator.userAgent);
}

/**
 * saveGeoJSON(geojsonObj, filename)
 * --------------------------
 * GeoJSON 객체를 파일로 저장.
 *
 * Android/desktop: <a download> 방식을 사용해 자동 다운로드.
 * iOS: Web Share API 를 통해 공유 시트를 띄워
 *      사용자가 “파일에 저장” 위치를 직접 선택하도록 함.
 *
 * 이유:
 *  - iOS는 자동 다운로드 기능이 제한되어 있어,
 *    브라우저 기본 다운로드가 불가능.
 *  - Web Share API 사용 시 iOS/Android 모두 안정적인 UX 제공.
 */
async function saveGeoJSON(geojsonObj, filename) {
  const blob = new Blob([JSON.stringify(geojsonObj, null, 2)], { type: "application/json" });
  const file = new File([blob], filename, { type: blob.type });

  if (isIOS() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: "GeoJSON 파일 공유"
      });
    } catch (err) {
      console.error("GeoJSON 공유 실패 또는 취소됨:", err);
    }
  } else {
    // Android / desktop fallback
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }
}

/**
 * saveImageFile(inputId, filename)
 * --------------------------
 * <input type="file"> 로 선택된 이미지를 저장.
 *
 * Android/desktop: 자동 다운로드.
 * iOS: Web Share API 공유 시트로 사진 앱에 저장 선택.
 *
 * 이유:
 *  - iOS Web에서는 Blob을 직접 앨범에 저장할 수 없으므로
 *    공유 시트를 통해 “사진에 저장” 동작을 유도.
 */
async function saveImageFile(inputId, filename) {
  const input = document.getElementById(inputId);
  if (!input.files.length) return;

  const blob = input.files[0];
  const file = new File([blob], filename, { type: blob.type });

  if (isIOS() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: "조사 사진 공유"
      });
    } catch (err) {
      console.error(`${inputId} 공유 실패 또는 취소됨:`, err);
    }
  } else {
    // Android / desktop fallback
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }
}

/**
 * finishCollection(best, name, placename, address)
 * --------------------------
 * 위치 수집이 완료된 후 호출.
 * 1) GeoJSON 객체 생성
 * 2) 파일명 생성
 * 3) GeoJSON 및 사진 저장 호출
 * 4) 지도에 마커 표시 및 범례 추가
 *
 * 이렇게 분리한 이유:
 *  - startTracking()이 너무 길어지지 않도록
 *  - 저장과 표시 로직을 모듈화하여 재사용성↑
 */
function finishCollection(best, name, placename, address) {
  // 1) GeoJSON 생성
  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [best.coords.longitude, best.coords.latitude]
      },
      properties: {
        name,
        placename,
        road_address: address,
        accuracy: best.coords.accuracy,
        timestamp: new Date(best.timestamp).toISOString()
      }
    }]
  };

  // 2) 파일명 생성 (사용자명_YYYYMMDD_HHMMSS)
  const now = new Date();
  const stamp = now.toISOString().slice(0,10).replace(/-/g,"") + "_" +
                now.toTimeString().slice(0,8).replace(/:/g,"");
  const baseName = `${name}_${stamp}`;

  // 3) 저장 호출
  saveGeoJSON(geojson, `${baseName}.geojson`);
  // 원경(photoWide) 저장
  setTimeout(() => {
    saveImageFile("photoWide", `${baseName}_wide.jpg`);
  }, 200);
  // 근경(photoClose) 저장은 0.2초 뒤에 실행
  setTimeout(() => {
    saveImageFile("photoClose", `${baseName}_close.jpg`);
  }, 400);

  // 4) 지도에 표시
  drawMarker(best.coords.latitude, best.coords.longitude,
             placename, name, best.coords.accuracy, address, true);
  addLegendItem(`${name} (오늘 조사)`, "red");
}

/**
 * startTracking()
 * --------------------------
 * 사용자가 “위치 수집 시작”을 누르면 실행.
 * 1) 입력값 검증 (이름 필수)
 * 2) geolocation.watchPosition으로 위치 수신
 * 3) 1초마다 남은 시간 카운트다운 표시
 * 4) 설정된 시간 후 clearWatch + confirm 대화상자
 * 5) 사용자가 확인 시 finishCollection() 호출
 *
 * 와이...? watchPosition
 *  - 일정 시간 동안 연속 수신된 좌표 중 최적의(정확도 높은) 값을 선택하기 위해.
 * 
 * 장점:: 
 * GPS 수신 시 리시버가 내부적으로 계산한 HDOP, 위성 잡음 등의 정보가 coords.accuracy 에 반영되어 있으므로,
 * 이 값이 가장 작은 순간(가장 좋은 상태)의 위치가 실제 오차도 가장 작을 확률이 높다 함.
 * 
 * 단점::
 * 한 번의 스냅샷이므로, 만약 그 순간에 우연히 위성 신호가 좋지 않거나,
 * 아주 희박하게 잘못된 리포트가 들어오면 오히려 나쁜 위치가 선택될 수 있다 함.
 * 
 * **** 위치 수신 시 주의 사항 ??
 * 랜덤 노이즈(작은 흔들림)를 줄여야 함. 즉, 가만히 들고 있어라 이말...
 * 
 */
function startTracking() {
  const name = document.getElementById("name").value.trim();
  const placename = document.getElementById("placename").value.trim();
  const duration = parseInt(document.getElementById("duration").value);
  const statusEl = document.getElementById("status");
  const countdownEl = document.getElementById("countdown");

  if (!name) {
    alert("조사자 이름을 입력하세요.");
    return;
  }

  positions = [];
  statusEl.innerText = "위치 수신 중...";
  countdownEl.innerText = `남은 시간: ${duration}초`;

  if (!navigator.geolocation) {
    statusEl.innerText = "이 브라우저에서는 위치 기능을 지원하지 않습니다.";
    return;
  }

  // 위치 연속 수신
  watchId = navigator.geolocation.watchPosition(
    pos => positions.push(pos),
    err => statusEl.innerText = "위치 수신 실패: " + err.message,
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );

  // 카운트다운 타이머
  let remaining = duration;
  const timer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      countdownEl.innerText = `남은 시간: ${remaining}초`;
    }
  }, 1000);

  // 설정된 시간 후 처리
  setTimeout(() => {
    clearInterval(timer);
    countdownEl.innerText = "";
    navigator.geolocation.clearWatch(watchId);

    // 사용자 확인 대화상자
    if (!confirm("위치 수집이 완료되었습니다.\n확인 버튼을 누르면 데이터를 저장합니다.")) {
      statusEl.innerText = "위치 수집이 취소되었습니다.";
      return;
    }

    if (positions.length === 0) {
      statusEl.innerText = "위치를 수신하지 못했습니다.";
      return;
    }

    // 최적 위치 선택 (정확도 기준)
    const best = positions.reduce((a, b) =>
      a.coords.accuracy < b.coords.accuracy ? a : b
    );
    statusEl.innerText = `수신 완료. 정확도: ${best.coords.accuracy.toFixed(1)}m`;

    // 주소 변환 후 저장/표시
    getAddressFromCoords(best.coords.latitude, best.coords.longitude, address => {
      finishCollection(best, name, placename, address);
    });
  }, duration * 1000);
}

/**
 * getAddressFromCoords(lat, lng, callback)
 * --------------------------
 * Kakao Local REST API를 이용해 좌표 → 도로명주소로 변환.
 * 비동기 호출 결과를 callback으로 반환.
 *
 * 이유:
 *  - 클라이언트 측에서 바로 주소를 가져오기 위해 별도 백엔드 없이 REST API 사용.
 */
function getAddressFromCoords(lat, lng, callback) {
  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`;
  fetch(url, { headers: { Authorization: "KakaoAK " + KAKAO_API_KEY }})
    .then(res => res.json())
    .then(data => {
      const addr = data.documents?.[0]?.road_address?.address_name || "";
      callback(addr);
    })
    .catch(err => {
      console.error("주소 변환 실패", err);
      callback("");
    });
}

/**
 * drawMarker(lat, lng, placename, name, acc, addr, isToday)
 * --------------------------
 * 지도에 마커와 텍스트 오버레이를 띄움움.
 * 클러스터링을 위해 clusterer.addMarker() 사용.
 *
 * 매개변수:
 *  - isToday: 오늘 수집한 점이면 빨간색으로 강조
 *
 * 이유:
 *  - 카카오맵 표준 방식으로 마커 + InfoWindow
 */
function drawMarker(lat, lng, placename, name, acc, addr, isToday) {
  const color = isToday ? "red" : colors[colorIndex++ % colors.length];
  const pos = new kakao.maps.LatLng(lat, lng);

  // 1) 마커 생성 & 클러스터러에 추가
  const marker = new kakao.maps.Marker({ position: pos, map });
  clusterer.addMarker(marker);

  // 2) 커스텀 오버레이(텍스트) 표시
  new kakao.maps.CustomOverlay({
    position: pos,
    content: `<div style="
                background:white;
                border:1px solid #666;
                padding:2px 6px;
                font-size:11px;
                border-radius:3px;
              ">${placename}</div>`,
    yAnchor: 1
  }).setMap(map);

  // 3) 클릭 시 InfoWindow
  const info = new kakao.maps.InfoWindow({
    content: `<div style="padding:10px;">
                <b>${name}</b><br/>
                ${placename}<br/>
                정확도: ${acc.toFixed(1)}m<br/>
                ${addr}
              </div>`
  });
  kakao.maps.event.addListener(marker, 'click', () => info.open(map, marker));
}

/**
 * loadGeojsonFiles(event)
 * --------------------------
 * 사용자가 업로드한 GeoJSON 파일을 파싱해
 * 지도에 마커를 다시 그림.
 *
 * FileReader를 사용해 클라이언트에서 JSON 직접 읽음.
 */
function loadGeojsonFiles(event) {
  Array.from(event.target.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const data = JSON.parse(e.target.result);
      const p0 = data.features[0].properties;
      const name = p0.name || `조사자 ${colorIndex+1}`;
      addLegendItem(name, colors[colorIndex % colors.length]);

      data.features.forEach(f => {
        drawMarker(
          f.geometry.coordinates[1],
          f.geometry.coordinates[0],
          f.properties.placename,
          f.properties.name,
          f.properties.accuracy,
          f.properties.road_address,
          false
        );
      });
      colorIndex++;
    };
    reader.readAsText(file);
  });
}

/**
 * addLegendItem(label, color)
 * --------------------------
 * 지도 우측 하단에 범례(legend)를 추가.
 * 
 * 이유:
 *  - 조사자별 마커 색상 구분 → 누가 찍은 점인지 식별 용이
 */
function addLegendItem(label, color) {
  const legendBox = document.getElementById("legend");
  const item = document.createElement("div");
  item.innerHTML = `
    <span style="
      display:inline-block;
      width:12px;height:12px;
      background:${color};
      margin-right:6px;
      border-radius:50%;
    "></span>
    ${label}
  `;
  legendBox.appendChild(item);
}

/**
 * analyzeGeojsonFiles(event)
 * --------------------------
 * 업로드된 GeoJSON 파일들을 분석해
 * 조사자별 통계 데이터를 생성.
 * 
 * 완료 시 drawChart()와 renderTable() 호출.
 */
function analyzeGeojsonFiles(event) {
  globalSummary = {};
  globalResults = [];
  let done = 0;
  const files = event.target.files;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const data = JSON.parse(e.target.result);
      data.features.forEach(f => {
        const p = f.properties;
        if (!globalSummary[p.name]) {
          globalSummary[p.name] = { count:0, acc:0 };
        }
        globalSummary[p.name].count++;
        globalSummary[p.name].acc += p.accuracy;
        globalResults.push({
          name: p.name,
          place: p.placename,
          acc: p.accuracy,
          time: p.timestamp
        });
      });
      done++;
      if (done === files.length) {
        drawChart(globalSummary);
        renderTable(globalSummary, globalResults);
      }
    };
    reader.readAsText(file);
  });
}

/**
 * drawChart(summary)
 * --------------------------
 * Chart.js 를 이용해 조사자별 수집 건수를
 * 막대그래프로 시각화함함.
 */
function drawChart(summary) {
  const ctx = document.getElementById("reportChart").getContext("2d");
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(summary),
      datasets: [{
        label: '수집 건수',
        data: Object.values(summary).map(s => s.count),
        backgroundColor: 'rgba(54,162,235,0.6)'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: '조사자별 수집 건수' }
      }
    }
  });
}

/**
 * renderTable(summary, results)
 * --------------------------
 * HTML 리스트와 표 형태로 통계 요약 및 장소 목록을 표시.
 */
function renderTable(summary, results) {
  let html = "<h3>분석 요약</h3><ul>";
  for (let name in summary) {
    const s = summary[name];
    html += `<li><b>${name}</b>: ${s.count}건, 평균 정확도 ${(s.acc/s.count).toFixed(1)}m</li>`;
  }
  html += "</ul><h4>장소 목록</h4><ol>";
  results.forEach(r => {
    html += `<li>${r.name} - ${r.place} (${r.acc}m, ${new Date(r.time).toLocaleString()})</li>`;
  });
  html += "</ol>";
  document.getElementById("reportResult").innerHTML = html;
}

/**
 * downloadPDF()
 * --------------------------
 * jsPDF 를 사용해 현재 분석 통계와
 * 장소 목록을 PDF로 저장.
 */
function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // 1) 커스텀 한글 폰트 설정
  // 'NotoSansKR' 는 fontconverter 할 때 지정한 fontName 과 동일해야 함.
  doc.setFont("NotoSansKR", "normal");

  doc.setFontSize(14);
  doc.text("조사 분석 리포트", 10, 10);

  let y = 30;
  // 통계 요약 텍스트 추가
  for (let name in globalSummary) {
    const s = globalSummary[name];
    doc.setFontSize(10);
    doc.text(`${name}: ${s.count}건, 평균 정확도 ${(s.acc/s.count).toFixed(1)}m`, 10, y);
    y += 6;
  }

  y += 10;
  // 장소 목록 (최대 30건)
  globalResults.slice(0,30).forEach(r => {
    doc.setFontSize(9);
    doc.text(
      `${r.name} - ${r.place} (${r.acc}m, ${new Date(r.time).toLocaleString()})`,
      10, y
    );
    y += 5;
  });

  doc.save("report.pdf");
}

/**
 * window.onload
 * --------------------------
 * 페이지 로드 시 최초 실행:
 *  - Kakao Map 초기화
 *  - 클러스터러 세팅
 *  - 지도 컨트롤 추가
 *  - “내 위치” 버튼 이벤트 바인딩
 */
window.onload = () => {
  // 1) 지도 초기화 (초기 중심 좌표 사용)
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(35.84286312641238, 128.7650856685357),
    level: 3
  });

  // 2) 마커 클러스터러
  clusterer = new kakao.maps.MarkerClusterer({
    map,
    averageCenter: true,
    minLevel: 5
  });

  // 3) 맵 타입 및 줌 컨트롤
  map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
  map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  // 4) “내 위치” 버튼 이벤트
  document.getElementById("locateBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("이 브라우저에서는 위치 기능을 지원하지 않습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const currentLatLng = new kakao.maps.LatLng(lat, lng);

        // 지도 중심 이동
        map.setCenter(currentLatLng);

        // 기존 마커 제거
        if (window.currentMarker) window.currentMarker.setMap(null);

        // 새 마커 생성
        window.currentMarker = new kakao.maps.Marker({
          position: currentLatLng,
          map,
          title: "현재 위치"
        });
      },
      err => alert("위치 정보를 가져올 수 없습니다: " + err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};
