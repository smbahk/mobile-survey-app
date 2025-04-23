@echo off
REM ✅ GitHub 자동 업로드 스크립트 (비공개 레포지토리용)
REM 작성자: 조사앱 개발자

REM 1. 레포지토리 경로로 이동 (※ 사용자가 직접 수정)
cd /d "C:\경로\gps_webapp"

REM 2. Git 초기화 (처음 1회만)
git init

REM 3. 원격 주소 등록 (이미 등록되어 있다면 생략 가능)
git remote add origin https://github.com/smbahk/mobile-survey-app.git

REM 4. 커밋 및 푸시
git add .
git commit -m "자동 업로드 - 최신 조사앱 소스"
git branch -M main
git push -u origin main
pause
