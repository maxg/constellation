import * as sharedb from 'sharedb/lib/sharedb';

declare module 'sharedb/lib/sharedb' {
  export interface Error {
    //@ts-expect-error @types/sharedb has numeric error codes
    code: string;
  }
}

declare module 'sharedb/lib/client' {
  // add missing error code constants...
  export const Error: {
    CODES: { [_: string]: number } // ... but match incorrect type of Error.code
  };
  
  // add missing connection events
  type ConnectionState = 'connecting'|'connected'|'disconnecting'|'disconnected'|'closed'|'stopped';
  interface Connection extends sharedb.TypedEmitter<{
    state: (newState: ConnectionState, reason: string) => void,
    error: (err: sharedb.Error) => void,
  }> {
  }
}
