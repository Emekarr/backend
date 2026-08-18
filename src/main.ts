import { infrastructure } from './infrastructure/container'

// Compatibility export. Express is implemented and initialized in the infrastructure layer.
export default infrastructure.httpServer
