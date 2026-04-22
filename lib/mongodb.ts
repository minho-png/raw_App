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
  _indexesEnsured?: boolean;
};

/**
 * 최초 관리자 자동 시드
 * users 컬렉션이 비어 있으면 Test1234 / Test1234 관리자 계정을 자동 생성합니다.
 */
async function seedDefaultAdmin(c: MongoClient): Promise<void> {
  try {
    const col = c.db().collection('users');
    const count = await col.countDocuments();
    if (count > 0) return;

    const crypto = await import('crypto');
    const COST = 16384;
    const KEY_LEN = 64;
    const salt = crypto.randomBytes(32).toString('hex');
    const passwordHash = crypto
      .scryptSync('Test1234', salt, KEY_LEN, { N: COST })
      .toString('hex');

    await col.insertOne({
      username: 'Test1234',
      passwordHash,
      passwordSalt: salt,
      role: 'admin',
      createdAt: new Date().toISOString(),
    });
    console.log('[MongoDB] 기본 관리자 계정 자동 생성 완료 (Test1234 / Test1234)');
  } catch (e) {
    console.warn('[MongoDB] 기본 관리자 시드 실패:', (e as Error).message);
  }
}

async function connectAndEnsureIndexes(): Promise<MongoClient> {
  const c = new MongoClient(getUri());
  await c.connect();
  if (!globalWithMongo._indexesEnsured) {
    globalWithMongo._indexesEnsured = true;
    const { RepositoryService } = await import('@/services/repositoryService');
    const repo = new RepositoryService(c);
    repo.ensureIndexes().catch(e => console.warn('[MongoDB] Index creation warning:', (e as Error).message));
    seedDefaultAdmin(c).catch(() => null);
  }
  return c;
}

// Lazy initialization to avoid connecting at build time
if (!globalWithMongo._mongoClientPromise) {
  // Check if we have MONGODB_URI available (not during build time)
  if (process.env.MONGODB_URI) {
    if (process.env.NODE_ENV === 'development') {
      client = new MongoClient(getUri());
      globalWithMongo._mongoClientPromise = client.connect().then(connectedClient => {
        if (!globalWithMongo._indexesEnsured) {
          globalWithMongo._indexesEnsured = true;
          import('@/services/repositoryService').then(({ RepositoryService }) => {
            new RepositoryService(connectedClient).ensureIndexes()
              .catch(e => console.warn('[MongoDB] Index creation warning:', (e as Error).message));
          });
          seedDefaultAdmin(connectedClient).catch(() => null);
        }
        return connectedClient;
      });
    } else {
      // Production: defer connection until first use
      globalWithMongo._mongoClientPromise = (async () => {
        return connectAndEnsureIndexes();
      })();
    }
  } else {
    // Build time or missing MONGODB_URI: placeholder promise that fails at runtime.
    // Attach .catch() immediately to suppress unhandled rejection during module init.
    const _buildTimeReject = Promise.reject(
      new Error('MONGODB_URI is not set. Please configure it in your environment variables.')
    );
    _buildTimeReject.catch(() => {});
    globalWithMongo._mongoClientPromise = _buildTimeReject;
  }
}
clientPromise = globalWithMongo._mongoClientPromise!;

export default clientPromise;
