# 🏠 HomeVault — คู่มือติดตั้ง

เว็บแอปเก็บ password สำหรับคนในบ้าน  
ใช้ Firebase (Firestore) + GitHub Pages

---

## 📁 โครงสร้างไฟล์

```
home-vault/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── firebase-config.js   ← แก้ค่า Firebase ที่นี่
└── README.md
```

---

## 🚀 ขั้นตอนติดตั้ง

### 1. สร้าง Firebase Project

1. ไปที่ [console.firebase.google.com](https://console.firebase.google.com)
2. คลิก **Add project** → ตั้งชื่อ (เช่น `home-vault`)
3. ปิด Google Analytics ได้เลย
4. คลิก **Create project**

---

### 2. เปิด Firestore Database

1. เมนูซ้าย → **Build → Firestore Database**
2. คลิก **Create database**
3. เลือก **Start in test mode** (แก้ rules ทีหลังได้)
4. เลือก Region ที่ใกล้ที่สุด (เช่น `asia-southeast1`)

---

### 3. ตั้งค่า Firestore Rules

ไปที่ Firestore → แท็บ **Rules** → วางโค้ดนี้:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // settings อ่านได้ทุกคน (สำหรับตรวจ invite code)
    match /settings/{doc} {
      allow read: if true;
      allow write: if false;
    }

    // users อ่านได้ทุกคน (แสดงรายชื่อสมาชิก)
    match /users/{userId} {
      allow read: if true;
      allow write: if true;  // เปิดไว้เพื่อให้สมัครได้

      // items — ทุกคนอ่าน public ได้, เจ้าของแก้ได้ทั้งหมด
      match /items/{itemId} {
        allow read: if true;
        allow write: if true;
      }
    }
  }
}
```

> ⚠️ เนื่องจากไม่ใช้ Firebase Auth จริง rules จึงเปิดกว้างไว้ก่อน  
> เหมาะสำหรับใช้งานในบ้าน ไม่แนะนำสำหรับสาธารณะ

---

### 4. สร้าง Invite Codes ใน Firestore

1. ใน Firestore → คลิก **Start collection**
2. Collection ID: `settings`
3. Document ID: `inviteCodes`
4. เพิ่ม Fields (แต่ละอันคือโค้ดเชิญ 1 ใบ):

| Field (โค้ดเชิญ)  | Type    | Value             |
|-------------------|---------|-------------------|
| `MYFAMILY2025`    | boolean | `true`            |
| `INVITE-MAMA`     | map     | `{ "username": "mama" }` |

- ถ้าเป็น `true` → ใครก็ใช้ได้
- ถ้าเป็น map ที่มี `username` → เฉพาะ username นั้นเท่านั้น

---

### 5. ใส่ Firebase Config ในโค้ด

1. Firebase Console → **Project Settings** (รูปเฟือง)
2. เลื่อนลงมาที่ **Your apps** → คลิก `</>` (Web)
3. Register app → ได้ config มาแล้วคัดลอก

เปิดไฟล์ `js/firebase-config.js` แก้บรรทัดนี้:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",         // ← ใส่ของจริง
  authDomain:        "home-vault.firebaseapp.com",
  projectId:         "home-vault",
  storageBucket:     "home-vault.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123"
};
```

---

### 6. อัปโหลดขึ้น GitHub Pages

1. สร้าง repository ใหม่บน GitHub (ชื่ออะไรก็ได้ เช่น `home-vault`)
2. อัปโหลดไฟล์ทั้งหมดเข้าไป
3. ไปที่ **Settings → Pages**
4. Source: **Deploy from a branch** → branch: `main` → folder: `/ (root)`
5. Save → รอสักครู่ จะได้ URL เช่น `https://yourname.github.io/home-vault`

---

## 🔑 วิธีใช้งาน

### สมัครสมาชิก (ครั้งแรก)
1. เปิดเว็บ → กด **สมัครด้วยโค้ดเชิญ**
2. ใส่โค้ดที่ Admin บอกให้
3. ตั้ง username, ชื่อที่แสดง, password

### เพิ่มรายการ
1. Login → กดชื่อตัวเอง
2. กด **+ เพิ่มรายการ**
3. ใส่ข้อมูล → เลือก Public/Private → กด **บันทึก**

### ดูรายการของคนอื่น
- กดชื่อสมาชิก → จะเห็นเฉพาะรายการที่ตั้งเป็น 🌐 Public

---

## 🗂️ โครงสร้างข้อมูลใน Firestore

```
firestore/
├── settings/
│   └── inviteCodes         { "CODE1": true, "CODE2": { username: "..." } }
│
└── users/
    └── {username}/
        ├── displayName     string
        ├── passwordHash    string (SHA-256)
        ├── createdAt       number
        └── items/
            └── {itemId}/
                ├── name       string
                ├── username   string
                ├── password   string
                ├── note       string
                ├── public     boolean
                └── createdAt  number
```

---

## ❓ FAQ

**Q: ลืม password ของ member ทำยังไง?**  
A: Admin เข้าไปแก้ใน Firestore Console ได้เลย — แก้ field `passwordHash` เป็น hash ใหม่  
หรือ Admin รัน snippet นี้ใน Browser console เพื่อหา hash:
```js
const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("new-password"));
console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''));
```

**Q: เพิ่ม member ใหม่ทำยังไง?**  
A: Admin เพิ่ม invite code ใหม่ใน Firestore → `settings/inviteCodes`

**Q: ลบ member ทำยังไง?**  
A: Admin ลบ document `users/{username}` และ subcollection `items` ทั้งหมดใน Firestore Console
