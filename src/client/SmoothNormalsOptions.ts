/** Optional arguments for procedural meshes with automatic smooth normals. */
export interface SmoothNormalsOptions {
    /** Should smooth normals be added? */
    smoothNormals?: boolean;
    /** The maximum angle for hard normals to be turned into smooth normals. */
    maxSmoothAngle?: number;
}