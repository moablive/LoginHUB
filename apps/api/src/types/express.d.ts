// src/types/express.d.ts
import { JWTPayload } from '@loginhub/shared';

declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}