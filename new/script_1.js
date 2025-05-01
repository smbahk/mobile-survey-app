/* ✅ 최적화된 모바일 현장조사 웹앱 로직 */
const KAKAO_API_KEY = "54334f6c1b1b42b6a57c2f4cb470cf2a"; // ⚠️ 도메인 제한 설정 권장 REST API
let map, clusterer, chart;
let positions = [], colorIndex = 0;
const colors = ["blue", "green", "orange", "purple", "black", "brown", "magenta"];
let globalStats = { byInvestigator: {}, byTime: {}, byAccuracy: [], byRegion: {}, accuracyHist: {} };

/* ✅ 위치 수집 시작 */
function startTracking() {
  const name = document.getElementById("name").value.trim();
  const placename = document.getElementById("placename").value.trim();
  const duration = parseInt(document.getElementById("duration").value);
  const trackBtn = document.getElementById("trackBtn");
  const status = document.getElementById("status");
  const counter = document.getElementById("counter");

  if (!name || !placename) {
    status.textContent = "조사자 이름과 장소명을 입력하세요.";
    status.className = "error";
    return;
  }

  trackBtn.disabled = true;
  trackBtn.textContent = "📍 수집 중...";
  status.textContent = "위치 수집 중...";
  status.className = "info";
  positions = [];
  let count = 0;
  counter.textContent = `수집 시간: ${count}초`;
  const counterInterval = setInterval(() => {
    count++;
    counter.textContent = `수집 시간: ${count}초`;
  }, 1000);

  const watchId = navigator.geolocation.watchPosition(
    pos => positions.push(pos),
    err => {
      status.textContent = `위치 수신 실패: ${err.message}`;
      status.className = "error";
      trackBtn.disabled = false;
      trackBtn.textContent = "📌 위치 수집 시작";
      counter.textContent = "";
      clearInterval(counterInterval);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );

  setTimeout(() => {
    navigator.geolocation.clearWatch(watchId);
    trackBtn.disabled = false;
    trackBtn.textContent = "📌 위치 수집 시작";
    counter.textContent = "";
    clearInterval(counterInterval);

    if (!positions.length) {
      status.textContent = "위치를 수신하지 못했습니다.";
      status.className = "error";
      return;
    }

    const best = positions.reduce((a, b) => a.coords.accuracy < b.coords.accuracy ? a : b);
    const lat = best.coords.latitude;
    const lng = best.coords.longitude;

    getAddressFromCoords(lat, lng, address => {
      const geojson = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            name, placename,
            road_address: address,
            accuracy: best.coords.accuracy,
            timestamp: new Date(best.timestamp).toISOString()
          }
        }]
      };

      const now = new Date();
      const stamp = now.toISOString().slice(0,10).replace(/-/g,"") + "_" + now.toTimeString().slice(0,8).replace(/:/g,"");
      const filename = `${name}_${stamp}`;
      try {
        saveBlob(JSON.stringify(geojson, null, 2), `${filename}.geojson`);
        saveImage("photoWide", `${filename}_wide.jpg`);
        saveImage("photoClose", `${filename}_close.jpg`);
        drawMarker(lat, lng, placename, name, best.coords.accuracy, address, true);
        addLegendItem(`${name} (오늘 조사)`, "red");
        status.textContent = "위치 수집 및 저장 완료!";
        status.className = "success";
      } catch (e) {
        status.textContent = `저장 실패: ${e.message}`;
        status.className = "error";
      }
    });
  }, duration * 1000);
}

/* ✅ 파일 저장 */
function saveBlob(blobText, filename) {
  const blob = new Blob([blobText], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ✅ 사진 저장 (압축 적용) */
function saveImage(inputId, filename) {
  const input = document.getElementById(inputId);
  if (!input.files.length) return;

  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    document.getElementById("status").textContent = "이미지 크기는 5MB 이하로 제한됩니다.";
    document.getElementById("status").className = "error";
    return;
  }

  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = img.width * 0.5;
    canvas.height = img.height * 0.5;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/jpeg", 0.8);
    URL.revokeObjectURL(img.src);
  };
}

/* ✅ 좌표 → 도로명 주소 변환 */
function getAddressFromCoords(lat, lng, callback) {
  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`;
  fetch(url, {
    headers: { Authorization: "KakaoAK " + KAKAO_API_KEY }
  }).then(res => res.json()).then(data => {
    const address = data.documents?.[0]?.road_address?.address_name || data.documents?.[0]?.address?.address_name || "주소 없음";
    callback(address);
  }).catch(err => {
    document.getElementById("status").textContent = "주소 변환 실패";
    document.getElementById("status").className = "error";
    callback("");
  });
}

/* ✅ 마커 및 정보창 표시 */
function drawMarker(lat, lng, placename, name, acc, addr, isToday) {
  const color = isToday ? "red" : colors[colorIndex++ % colors.length];
  const marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(lat, lng) });
  clusterer.addMarker(marker);

  new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(lat, lng),
    content: `<div style="background:white;border:1px solid #666;padding:2px 6px;font-size:11px;border-radius:3px;">${placename}</div>`,
    yAnchor: 1
  }).setMap(map);

  const infowindow = new kakao.maps.InfoWindow({
    content: `<div style="padding:10px;">
      <b>${name}</b><br/>${placename}<br/>정확도: ${acc.toFixed(1)}m<br/>${addr}
    </div>`
  });
  kakao.maps.event.addListener(marker, 'click', () => infowindow.open(map, marker));
}

/* ✅ 기존 GeoJSON 파일 불러오기 */
function loadGeojsonFiles(event) {
  const files = event.target.files;
  const status = document.getElementById("status");
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
          throw new Error("유효하지 않은 GeoJSON 형식");
        }
        const name = data.features[0]?.properties?.name || `조사자 ${colorIndex + 1}`;
        const color = colors[colorIndex++ % colors.length];
        addLegendItem(name, color);
        data.features.forEach(f => {
          if (f.geometry?.type !== "Point" || !Array.isArray(f.geometry.coordinates)) return;
          const coords = f.geometry.coordinates;
          const p = f.properties;
          drawMarker(coords[1], coords[0], p.placename, p.name, p.accuracy, p.road_address, false);
        });
        status.textContent = `${file.name} 파일 로드 완료`;
        status.className = "success";
      } catch (e) {
        status.textContent = `파일 로드 실패: ${e.message}`;
        status.className = "error";
      }
    };
    reader.readAsText(file);
  });
}

/* ✅ GeoJSON 분석 */
function analyzeGeojsonFiles(event) {
  const files = event.target.files;
  const status = document.getElementById("status");
  globalStats = { byInvestigator: {}, byTime: {}, byAccuracy: [], byRegion: {}, accuracyHist: {} };

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
          throw new Error("유효하지 않은 GeoJSON 형식");
        }
        data.features.forEach(f => {
          if (f.geometry?.type !== "Point" || !Array.isArray(f.geometry.coordinates)) return;
          const { name, timestamp, accuracy, road_address } = f.properties;
          globalStats.byInvestigator[name] = (globalStats.byInvestigator[name] || 0) + 1;
          const hour = new Date(timestamp).getHours();
          globalStats.byTime[hour] = (globalStats.byTime[hour] || 0) + 1;
          globalStats.byAccuracy.push(accuracy);
          const region = road_address ? road_address.split(" ")[1] || "알 수 없음" : "알 수 없음";
          globalStats.byRegion[region] = (globalStats.byRegion[region] || 0) + 1;
          const bin = Math.floor(accuracy / 10) * 10;
          globalStats.accuracyHist[bin] = (globalStats.accuracyHist[bin] || 0) + 1;
        });

        const resultDiv = document.getElementById("reportResult");
        resultDiv.innerHTML = `
          <h3>분석 결과</h3>
          <p>총 위치 수: ${data.features.length}</p>
          <p>조사자별 위치 수: ${Object.entries(globalStats.byInvestigator).map(([k, v]) => `${k}: ${v}`).join(", ")}</p>
          <p>지역별 분포: ${Object.entries(globalStats.byRegion).map(([k, v]) => `${k}: ${v}`).join(", ")}</p>
          <p>평균 정확도: ${(globalStats.byAccuracy.reduce((a, b) => a + b, 0) / globalStats.byAccuracy.length).toFixed(1)}m</p>
          <p>정확도 히스토그램: ${Object.entries(globalStats.accuracyHist).map(([k, v]) => `${k}~${parseInt(k)+10}m: ${v}`).join(", ")}</p>
        `;
        drawChart();
        status.textContent = "분석 완료!";
        status.className = "success";
      } catch (e) {
        status.textContent = `분석 실패: ${e.message}`;
        status.className = "error";
      }
    };
    reader.readAsText(file);
  });
}

/* ✅ 차트 그리기 */
function drawChart() {
  const ctx = document.getElementById("reportChart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(globalStats.accuracyHist).map(k => `${k}~${parseInt(k)+10}m`),
      datasets: [{
        label: "정확도 히스토그램",
        data: Object.values(globalStats.accuracyHist),
        backgroundColor: "rgba(60, 137, 204, 0.6)",
        borderColor: "rgba(60, 137, 204, 1)",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "위치 수" } },
        x: { title: { display: true, text: "정확도 구간 (m)" } }
      },
      plugins: { legend: { display: true } }
    }
  });
}

/* ✅ PDF 저장 */
function downloadPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const status = document.getElementById("status");

  try {
    doc.setFontSize(16);
    doc.text("현장조사 분석 리포트", 20, 20);
    doc.setFontSize(12);
    doc.text(`생성 시간: ${new Date().toLocaleString()}`, 20, 30);
    doc.text(`총 위치 수: ${globalStats.byAccuracy.length}`, 20, 40);
    doc.text(`조사자별 위치 수:`, 20, 50);
    let y = 60;
    for (const [name, count] of Object.entries(globalStats.byInvestigator)) {
      doc.text(`${name}: ${count}`, 30, y);
      y += 10;
    }
    doc.text(`지역별 분포:`, 20, y);
    y += 10;
    for (const [region, count] of Object.entries(globalStats.byRegion)) {
      doc.text(`${region}: ${count}`, 30, y);
      y += 10;
    }
    doc.text(`평균 정확도: ${(globalStats.byAccuracy.reduce((a, b) => a + b, 0) / globalStats.byAccuracy.length || 0).toFixed(1)}m`, 20, y);
    y += 10;
    doc.text(`정확도 히스토그램:`, 20, y);
    y += 10;
    for (const [bin, count] of Object.entries(globalStats.accuracyHist)) {
      doc.text(`${bin}~${parseInt(bin)+10}m: ${count}`, 30, y);
      y += 10;
    }

    const canvas = document.getElementById("reportChart");
    const imgData = canvas.toDataURL("image/png");
    doc.addImage(imgData, "PNG", 20, y + 10, 160, 80);
    doc.save("survey_report.pdf");
    status.textContent = "PDF 저장 완료!";
    status.className = "success";
  } catch (e) {
    status.textContent = `PDF 저장 실패: ${e.message}`;
    status.className = "error";
  }
}

/* ✅ 지도 범례 */
function addLegendItem(label, color) {
  const legendBox = document.getElementById("legend");
  const item = document.createElement("div");
  item.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${color};margin-right:6px;border-radius:50%;"></span>${label} <button onclick="this.parentElement.remove()">삭제</button>`;
  legendBox.appendChild(item);
}

/* ✅ 지적편집도 레이어 */
function toggleCadLayer() {
  const current = map.getOverlayMapTypeId();
  map.setOverlayMapTypeId(current ? null : kakao.maps.MapTypeId.USE_DISTRICT);
}

/* ✅ 지도 및 클러스터 초기화 */
window.onload = () => {
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(37.5665, 126.9780),
    level: 3
  });
  clusterer = new kakao.maps.MarkerClusterer({
    map,
    averageCenter: true,
    minLevel: 5,
    minClusterSize: 3
  });
  map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
  map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
};