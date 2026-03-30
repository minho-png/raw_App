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

async function connectAndEnsureIndexes(): Promise<MongoClient> {
  const c = new MongoClient(getUri());
  await c.connect();
  if (!globalWithMongo._indexesEnsured) {
    globalWithMongo._indexesEnsured = true;
    const { RepositoryService } = await import('@/services/repositoryService');
    const repo = new RepositoryService(c);
    repo.ensureIndexes().catch(e => console.warn('[MongoDB] Index creation warning:', e.message));
  }
  return c;
}

if (process.env.NODE_ENV === 'development') {
  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(getUri());
    globalWithMongo._mongoClientPromise = client.connect().then(connectedClient => {
      if (!globalWithMongo._indexesEnsured) {
        globalWithMongo._indexesEnsured = true;
        import('@/services/repositoryService').then(({ RepositoryService }) => {
          new RepositoryService(connectedClient).ensureIndexes()
            .catch(e => console.warn('[MongoDB] Index creation warning:', e.message));
        });
      }
      return connectedClient;
    });
  }
  clientPromise = globalWithMongo._mongoClientPromise!;
} else {
  clientPromise = connectAndEnsureIndexes();
}

export default clientPromise;
