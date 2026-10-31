# FRND - Multi-Platform Social Discovery, Events & Celebrity Calling Platform

A comprehensive multi-platform application ecosystem built with real-time WebRTC audio/video matchmaking, location-based event ticketing, celebrity VIP hub, and customer support helpdesk.

---

## 🏗️ System Architecture & Platforms

| Platform | Tech Stack | Status |
|---|---|---|
| **Realtime Backend & API** | TypeScript, WebSockets, WebRTC Signaling, PostGIS Geo-queries, JWT, Redis Matchmaking Engine | ✅ Complete & Verified |
| **Web Application** | Responsive Single Page App (HTML5, Tailwind CSS, WebRTC audio, QR Ticket generator) | ✅ Complete |
| **Android Native App** | Kotlin, Jetpack Compose, Material 3, WebRTC Android SDK, Telecom Framework | ✅ Complete |
| **iOS Native App** | Swift, SwiftUI, WebRTC iOS Wrapper, Apple CallKit Manager | ✅ Complete |
| **DevOps & Containers** | Dockerfile, Docker Compose (PostGIS + Redis + Coturn TURN server) | ✅ Ready |

---

## 🌟 Key Features & User Roles

### 1. Normal User (റാൻഡം ഫ്രണ്ട്സ് & ഇവന്റുകൾ)
- **Mobile OTP Login**: Instant OTP verification and role assignment.
- **Random Audio Friends Matchmaking**: One-click pairing into real-time 1-on-1 WebRTC audio calls with online members; audio waveform animation; call timer; mic mute; instant "Next Friend" skip.
- **Location-Based Events**: PostGIS great-circle geo-query sorted by distance (5 km, 25 km, 50 km); ticket booking with dynamic QR code generation.
- **Celebrity Hub**: View celebrity media feed (photos & videos); like & comment; initiate VIP Audio / Video calls (backed by wallet coins/credits).
- **Customer Care Helpdesk**: 2-way real-time live chat & in-app VoIP audio calls to support executives.

### 2. Organization User (കമ്പനികൾ / ഓർഗനൈസേഴ്സ്)
- Publish events with venue address, GPS coordinates, dates, and ticket tiers.
- Digital ticket verification scanner to check-in attendees and prevent ticket fraud.
- Direct customer care channel.

### 3. Celebrity User (സെലിബ്രിറ്റീസ്)
- Verified artist profile with followers count & call rates (e.g. 50 coins/min).
- Share photos & rehearsal videos to fans feed.
- Receive incoming VIP 1-on-1 audio/video calls from premium fans with per-minute earnings.

### 4. Customer Care Support User (സപ്പോർട്ട് ഡെസ്ക്)
- Dedicated desk for receiving and resolving queries from Normal Users, Organizations, and Celebrities.
- VoIP audio support calling.

### 5. Super Admin (സൂപ്പർ അഡ്മിൻ)
- Full platform control: Ban/unban abusive users.
- Approve/verify organizations and celebrities.
- Real-time platform metrics: Active calls, total users, ticket revenue, queue size.

---

## 🚀 Quick Start Guide

### 1. Run Automated Backend Test Suite
```bash
deno run --allow-all backend/test/backend_test.ts
```
*Output: Verifies Auth, OTP, Geo-Ticketing, Celebrity VIP authorization, Random Audio Matchmaking, Support, and Admin metrics.*

### 2. Start the Backend & Web Application Server
```bash
deno run --allow-net --allow-read --allow-env backend/src/server.ts
```
Once started, open **`http://localhost:3000`** in your browser. You can:
- Switch roles (Normal, Organization, Celebrity, Support, Super Admin).
- Click **"Connect Random Friend"** to test 1-on-1 audio matchmaking.
- Browse **"Nearby Events"** and book a ticket to see the dynamic QR code pass.
- Open **"Celebrity Hub"** and test the VIP Call dialog.
- Open **"Customer Care"** and chat live with the support executive or trigger VoIP call.
- Open **"Super Admin"** to view revenue and ban/unban users.

### 3. Open Android Native App
1. Open **Android Studio**.
2. Select **Open** -> Choose `mobile-android/` folder.
3. Sync Gradle and run on an Android Device or Emulator (API 26+).

### 4. Open iOS Native App
1. Open **Xcode** on macOS.
2. Open `mobile-ios/` folder or project.
3. Run on an iOS Simulator or iPhone (iOS 16+).

### 5. Production Docker Deployment
```bash
docker-compose up -d
```
Starts PostgreSQL with PostGIS, Redis Cache, Coturn TURN server, and FRND backend in containerized isolation.
