// src/types/express.d.ts
import { JWTPayload } from '@loginhub/schema';

declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}