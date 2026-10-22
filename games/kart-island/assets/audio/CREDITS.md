# 泡泡賽車音效來源

換檔或加檔時，在下表補一列來源和授權。三個檔案都可以免費商用，不用標註作者。

| 檔案 | 用途 | 原始名稱與作者 | 來源 | 授權 |
|---|---|---|---|---|
| `sfx-boost.mp3` | 漂移加速、起跑加速、尾流加速、氮氣、泡泡火箭 | Player Boost Recharging（Mixkit） | https://mixkit.co/free-sound-effects/game/ ，檔案 https://assets.mixkit.co/active_storage/sfx/2040/2040-preview.mp3 | Mixkit Sound Effects Free License：https://mixkit.co/license/#sfxFree |
| `sfx-countdown.mp3` | 開跑倒數，第 1.915 秒是 GO | Race Start Ready go，steel2008 | https://freesound.org/people/steel2008/sounds/231277/ ，檔案用公開的 HQ 預覽 mp3 | CC0 1.0：https://creativecommons.org/publicdomain/zero/1.0/ |
| `bgm-dizzy-racing.mp3` | 比賽背景音樂，循環播放 | Dizzy Racing，Zane Little Music | https://opengameart.org/content/dizzy-racing | CC0 1.0 |

## 處理方式

1. `sfx-boost.mp3`、`sfx-countdown.mp3`：原檔，沒有改。
2. `bgm-dizzy-racing.mp3`：原檔是 52 MB 的 wav。剪掉結尾 1.5 秒靜音，用 ffmpeg 轉成 128 kbps mp3。

Mixkit 授權允許放進遊戲使用，不允許單獨轉賣或轉發原始音檔。
