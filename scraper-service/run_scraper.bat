@echo off
echo [%date% %time%] Scraper starting...
cd /d "C:\Users\Umut\Desktop\Clofthel\scraper-service"
node run_once.js
echo [%date% %time%] Scraper finished.
