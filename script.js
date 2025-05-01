
/* ✅ script.js 전체 기능 주석 포함 버전
 * 위치 수집, 주소 변환, GeoJSON 저장, 이미지 첨부, 지도 마커, 클러스터링, 차트 시각화, PDF 저장 등 통합
 */

// 🔐 반드시 본인의 Kakao REST API 키로 변경 필요
const KAKAO_API_KEY = "54334f6c1b1b42b6a57c2f4cb470cf2a";

let map, clusterer, watchId;
let positions = [], colorIndex = 0;
const colors = ["blue", "green", "orange", "purple", "black", "brown", "magenta"];
const legendItems = [];
let globalSummary = {}, globalResults = [];

/* ✅ 위치 수집 시작 */
function startTracking() {
  const name = document.getElementById("name").value.trim();
  const placename = document.getElementById("placename").value.trim();
  const duration = parseInt(document.getElementById("duration").value);
  const status = document.getElementById("status");
  const countdownEl = document.getElementById("countdown");

  if (!name) {
    alert("조사자 이름을 입력하세요.");
    return;
  }

  positions = [];
  status.innerText = "위치 수신 중...";
  countdownEl.innerText = `남은 시간: ${duration}초`;

  if (!navigator.geolocation) {
    status.innerText = "이 브라우저에서는 위치 기능을 지원하지 않습니다.";
    return;
  }

  // 위치 수신 시작
  watchId = navigator.geolocation.watchPosition(
    pos => positions.push(pos),
    err => status.innerText = "위치 수신 실패: " + err.message,
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );

  // 1초마다 카운트다운
  let remaining = duration;
  const timer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      countdownEl.innerText = `남은 시간: ${remaining}초`;
    }
  }, 1000);

  // 지정된 시간이 지나면
  setTimeout(() => {
    clearInterval(timer);              // 카운트다운 중지
    countdownEl.innerText = "";        // 카운트다운 지우기

    // 완료 확인창
    if (!confirm("위치 수집이 완료되었습니다.\n확인 버튼을 누르면 데이터를 저장합니다.")) {
      status.innerText = "위치 수집이 취소되었습니다.";
      navigator.geolocation.clearWatch(watchId);
      return;
    }

    // 위치 수신 중지 & 후속 처리
    navigator.geolocation.clearWatch(watchId);

    if (positions.length === 0) {
      status.innerText = "위치를 수신하지 못했습니다.";
      return;
    }
    const best = positions.reduce((a, b) =>
      a.coords.accuracy < b.coords.accuracy ? a : b
    );
    status.innerText = `수신 완료. 정확도: ${best.coords.accuracy.toFixed(1)}m`;

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
      saveBlob(JSON.stringify(geojson, null, 2), `${filename}.geojson`);
      saveImage("photoWide", `${filename}_wide.jpg`);
      saveImage("photoClose", `${filename}_close.jpg`);

      drawMarker(lat, lng, placename, name, best.coords.accuracy, address, true);
      addLegendItem(`${name} (오늘 조사)`, "red");
    });
  }, duration * 1000);
}

/* ✅ 파일 저장 함수 (GeoJSON) */
function saveBlob(blobText, filename) {
  const blob = new Blob([blobText], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ✅ 사진 저장 함수 */
function saveImage(inputId, filename) {
  const input = document.getElementById(inputId);
  if (!input.files.length) return;
  const blob = input.files[0];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ✅ 좌표 → 도로명주소 변환 */
function getAddressFromCoords(lat, lng, callback) {
  const url = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`;
  fetch(url, {
    headers: { Authorization: "KakaoAK " + KAKAO_API_KEY }
  }).then(res => res.json()).then(data => {
    const address = data.documents?.[0]?.road_address?.address_name || "";
    callback(address);
  }).catch(err => {
    console.error("주소 변환 실패", err);
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
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const data = JSON.parse(e.target.result);
      const name = data.features[0]?.properties?.name || `조사자 ${colorIndex + 1}`;
      const color = colors[colorIndex++ % colors.length];
      addLegendItem(name, color);
      data.features.forEach(f => {
        const coords = f.geometry.coordinates;
        const p = f.properties;
        drawMarker(coords[1], coords[0], p.placename, p.name, p.accuracy, p.road_address, false);
      });
    };
    reader.readAsText(file);
  });
}

/* ✅ 지도 범례 */
function addLegendItem(label, color) {
  const legendBox = document.getElementById("legend");
  const item = document.createElement("div");
  item.innerHTML = `<span style="display:inline-block;width:12px;height:12px;background:${color};margin-right:6px;border-radius:50%;"></span>${label}`;
  legendBox.appendChild(item);
}

/* ✅ 지적편집도 레이어 */
function toggleCadLayer() {
  const current = map.getOverlayMapTypeId();
  map.setOverlayMapTypeId(current ? null : kakao.maps.MapTypeId.USE_DISTRICT);
}

/* ✅ 지도 및 클러스터 초기화 */
window.onload = () => {
  // 지도 초기화화
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(35.84286312641238, 128.7650856685357),
    level: 3
  });
  clusterer = new kakao.maps.MarkerClusterer({
    map,
    averageCenter: true,
    minLevel: 5
  });

  // 확대/축소 & 지도타입 컨트롤
  map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
  map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  // “내 위치” 버튼 이벤트 바인딩
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

        // 기존 마커가 있다면 지우고, 새 마커 띄우기
        if (window.currentMarker) {
          window.currentMarker.setMap(null);
        }
        // 새 마커 찍기
        window.currentMarker = new kakao.maps.Marker({
          position: currentLatLng,
          map: map,
          title: "현재 위치"
        });
      },
      err => {
        alert("위치 정보를 가져오는 데 실패했습니다: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};
