package border_loader

import "core:mem"
import "base:runtime"

MAGIC_NUMBER :: 0x54424F52 // "TBOR"
MAX_MEMORY :: 100 * 1024 * 1024 // 100MB static buffer

Vector3 :: struct {
    x: f32,
    y: f32,
    z: f32,
}

BorderPath :: struct {
    points: []Vector3,
}

CountryBorders :: struct {
    country_index: u32,
    borders: []BorderPath,
}

BorderData :: struct {
    countries: []CountryBorders,
    total_borders: u32,
}

// Global state
g_border_data: BorderData
g_initialized: bool = false

// Static memory buffer and arena
g_memory_buffer: [MAX_MEMORY]byte
g_arena: mem.Arena
g_arena_allocator: mem.Allocator

// Required main function (even though it won't be called)
main :: proc() {}

// Console logging from JavaScript
@(default_calling_convention="c")
foreign {
    console_log :: proc(msg: cstring) ---
    console_error :: proc(msg: cstring) ---
}

// Helper to read u32 from buffer (little endian)
@(private)
read_u32 :: #force_inline proc "contextless" (data: []byte, offset: ^int) -> u32 {
    value := u32(data[offset^]) |
             u32(data[offset^ + 1]) << 8 |
             u32(data[offset^ + 2]) << 16 |
             u32(data[offset^ + 3]) << 24
    offset^ += 4
    return value
}

// Helper to read f32 from buffer (little endian)
@(private)
read_f32 :: #force_inline proc "contextless" (data: []byte, offset: ^int) -> f32 {
    bits := u32(data[offset^]) |
            u32(data[offset^ + 1]) << 8 |
            u32(data[offset^ + 2]) << 16 |
            u32(data[offset^ + 3]) << 24
    offset^ += 4
    return transmute(f32)bits
}

// Initialize the border loader
@(export)
init :: proc "c" () {
    context = runtime.default_context()

    // Initialize arena allocator with static buffer
    mem.arena_init(&g_arena, g_memory_buffer[:])
    g_arena_allocator = mem.arena_allocator(&g_arena)

    console_log("Odin border loader initialized")
    g_initialized = true
}

// Load and parse border data from binary buffer
@(export)
load_border_data :: proc "c" (data_ptr: rawptr, data_len: i32) -> i32 {
    if !g_initialized {
        console_error("Border loader not initialized!")
        return 0
    }

    console_log("Starting to parse border data in Odin...")

    // Set up context with our arena allocator
    context = runtime.default_context()
    context.allocator = g_arena_allocator

    // Reset arena for fresh allocation
    mem.arena_free_all(&g_arena)

    // Create slice from raw pointer
    data := mem.slice_ptr(cast(^byte)data_ptr, int(data_len))
    offset := 0

    // Read header
    magic := read_u32(data, &offset)
    if magic != MAGIC_NUMBER {
        console_error("Invalid magic number!")
        return 0
    }

    num_countries := read_u32(data, &offset)
    total_borders := read_u32(data, &offset)

    // Allocate countries array
    countries := make([]CountryBorders, num_countries)

    // Parse each country
    for i in 0..<num_countries {
        country_index := read_u32(data, &offset)
        num_borders := read_u32(data, &offset)

        // Allocate borders array for this country
        borders := make([]BorderPath, num_borders)

        // Parse each border
        for j in 0..<num_borders {
            num_points := read_u32(data, &offset)

            // Allocate points array
            points := make([]Vector3, num_points)

            // Parse each point
            for k in 0..<num_points {
                x := read_f32(data, &offset)
                y := read_f32(data, &offset)
                z := read_f32(data, &offset)
                points[k] = Vector3{x, y, z}
            }

            borders[j] = BorderPath{points = points}
        }

        countries[i] = CountryBorders{
            country_index = country_index,
            borders = borders,
        }
    }

    // Store in global state
    g_border_data = BorderData{
        countries = countries,
        total_borders = total_borders,
    }

    console_log("Border data parsed successfully in Odin!")
    return 1 // Success
}

// Get number of countries
@(export)
get_num_countries :: proc "c" () -> i32 {
    return i32(len(g_border_data.countries))
}

// Get total number of borders
@(export)
get_total_borders :: proc "c" () -> i32 {
    return i32(g_border_data.total_borders)
}

// Get country index for a given country position
@(export)
get_country_index :: proc "c" (country_pos: i32) -> i32 {
    if country_pos < 0 || country_pos >= i32(len(g_border_data.countries)) {
        return -1
    }
    return i32(g_border_data.countries[country_pos].country_index)
}

// Get number of borders for a country
@(export)
get_num_borders :: proc "c" (country_pos: i32) -> i32 {
    if country_pos < 0 || country_pos >= i32(len(g_border_data.countries)) {
        return 0
    }
    return i32(len(g_border_data.countries[country_pos].borders))
}

// Get number of points in a specific border
@(export)
get_num_points :: proc "c" (country_pos: i32, border_idx: i32) -> i32 {
    if country_pos < 0 || country_pos >= i32(len(g_border_data.countries)) {
        return 0
    }
    country := &g_border_data.countries[country_pos]
    if border_idx < 0 || border_idx >= i32(len(country.borders)) {
        return 0
    }
    return i32(len(country.borders[border_idx].points))
}

// Get a specific point (writes x, y, z to output buffer)
@(export)
get_point :: proc "c" (country_pos: i32, border_idx: i32, point_idx: i32, out_ptr: rawptr) -> i32 {
    if country_pos < 0 || country_pos >= i32(len(g_border_data.countries)) {
        return 0
    }
    country := &g_border_data.countries[country_pos]
    if border_idx < 0 || border_idx >= i32(len(country.borders)) {
        return 0
    }
    border := &country.borders[border_idx]
    if point_idx < 0 || point_idx >= i32(len(border.points)) {
        return 0
    }

    // Write point data to output buffer
    point := border.points[point_idx]
    out := mem.slice_ptr(cast(^f32)out_ptr, 3)
    out[0] = point.x
    out[1] = point.y
    out[2] = point.z

    return 1 // Success
}

// Get all points for a border at once (more efficient)
// Writes all points to output buffer as flat f32 array: [x0, y0, z0, x1, y1, z1, ...]
@(export)
get_all_points :: proc "c" (country_pos: i32, border_idx: i32, out_ptr: rawptr, max_points: i32) -> i32 {
    if country_pos < 0 || country_pos >= i32(len(g_border_data.countries)) {
        return 0
    }
    country := &g_border_data.countries[country_pos]
    if border_idx < 0 || border_idx >= i32(len(country.borders)) {
        return 0
    }
    border := &country.borders[border_idx]

    num_points := i32(len(border.points))
    if num_points > max_points {
        num_points = max_points
    }

    // Write all points to output buffer
    out := mem.slice_ptr(cast(^f32)out_ptr, int(num_points * 3))
    for point, i in border.points[:num_points] {
        out[i * 3 + 0] = point.x
        out[i * 3 + 1] = point.y
        out[i * 3 + 2] = point.z
    }

    return num_points
}
