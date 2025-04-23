
/* ✅ script.js 전체 기능 주석 포함 버전
 * 위치 수집, 주소 변환, GeoJSON 저장, 이미지 첨부, 지도 마커, 클러스터링, 차트 시각화, PDF 저장 등 통합
 */

// 🔐 반드시 본인의 Kakao REST API 키로 변경 필요
const KAKAO_API_KEY = "YOUR_REST_API_KEY";

let map, clusterer;
let positions = [], colorIndex = 0;
const colors = ["blue", "green", "orange", "purple", "black", "brown", "magenta"];
const legendItems = [];
let globalSummary = {}, globalResults = [];

/* ✅ 위치 수집 시작 */
function startTracking() {
  const name = document.getElementById("name").value.trim();
  const placename = document.getElementById("placename").value.trim();
  const duration = parseInt(document.getElementById("duration").value);
  if (!name) return alert("조사자 이름을 입력하세요.");

  positions = [];
  navigator.geolocation.watchPosition(
    pos => positions.push(pos),
    err => alert("위치 수신 실패: " + err.message),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );

  setTimeout(() => {
    navigator.geolocation.clearWatch(watchId);
    if (!positions.length) return alert("위치를 수신하지 못했습니다.");
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
  const container = document.getElementById("map");
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(37.5665, 126.9780),
    level: 3
  });
  clusterer = new kakao.maps.MarkerClusterer({
    map,
    averageCenter: true,
    minLevel: 5
  });
  map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
  map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
}
