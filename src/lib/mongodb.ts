import { MongoClient } from 'mongodb';

// 빌드 타임에 환경변수가 없어도 오류가 나지 않도록 지연 평가
function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI 환경변수를 .env.local에 추가하세요.');
  return uri;
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

if (process.env.NODE_ENV === 'development') {
  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(getUri());
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise!;
} else {
  // 프로덕션: 모듈 평가 시점이 아닌 첫 접근 시 연결
  clientPromise = new Promise((resolve, reject) => {
    try {
      const c = new MongoClient(getUri());
      resolve(c.connect());
    } catch (e) {
      reject(e);
    }
  });
}

export default clientPromise;
