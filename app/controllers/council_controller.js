import { Council } from '../models/index.js';
import { 
    successResponse, 
    errorResponse, 
    notFoundResponse, 
    createdResponse, 
    badRequestResponse 
} from '../utils/responseHandler.js';

// Get all councils with optional filtering
export async function getCouncils(req, res) {
    try {
        const { type, search, country } = req.query;
        
        const whereClause = {
            isActive: true
        };

        // Filter by type if provided
        if (type) {
            const validTypes = [
                'Metropolitan District',
                'London Borough',
                'Unitary Authority',
                'County Council',
                'District Council',
                'Special'
            ];
            
            if (!validTypes.includes(type)) {
                return badRequestResponse(res, 'Invalid council type');
            }
            
            whereClause.type = type;
        }

        if (country) {
            whereClause.country = String(country).trim().toUpperCase();
        }

        // Search by name if provided
        if (search) {
            whereClause.name = {
                [Council.sequelize.Sequelize.Op.iLike]: `%${search}%`
            };
        }

        const councils = await Council.findAll({
            where: whereClause,
            order: [['name', 'ASC']],
            attributes: ['id', 'name', 'type', 'country']
        });

        return successResponse(res, councils);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Get council by ID
export async function getCouncilById(req, res) {
    try {
        const { id } = req.params;
        
        const council = await Council.findOne({
            where: { 
                id,
                isActive: true
            },
            attributes: ['id', 'name', 'type', 'country']
        });

        if (!council) {
            return notFoundResponse(res, 'Council not found');
        }

        return successResponse(res, council);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Get all council types (for dropdown/filter purposes)
export async function getCouncilTypes(req, res) {
    try {
        const types = [
            { value: 'Metropolitan District', label: 'Metropolitan District' },
            { value: 'London Borough', label: 'London Borough' },
            { value: 'Unitary Authority', label: 'Unitary Authority' },
            { value: 'County Council', label: 'County Council' },
            { value: 'District Council', label: 'District Council' },
            { value: 'Special', label: 'Special' }
        ];

        return successResponse(res, types);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Admin: Add a new council
export async function addCouncil(req, res) {
    try {
        const { name, type, country } = req.body;

        // Check if council already exists
        const existingCouncil = await Council.findOne({
            where: { name }
        });

        if (existingCouncil) {
            return badRequestResponse(res, 'Council with this name already exists');
        }

        const council = await Council.create({
            name,
            type,
            country: country || 'GB-ENG'
        });

        return createdResponse(res, council);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Admin: Update council
export async function updateCouncil(req, res) {
    try {
        const { id } = req.params;
        const { name, type, isActive } = req.body;

        const council = await Council.findByPk(id);

        if (!council) {
            return notFoundResponse(res, 'Council not found');
        }

        await council.update({
            name: name || council.name,
            type: type || council.type,
            isActive: isActive !== undefined ? isActive : council.isActive
        });

        return successResponse(res, council);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

// Admin: Bulk add councils
export async function bulkAddCouncils(req, res) {
    try {
        const { councils } = req.body;

        if (!Array.isArray(councils) || councils.length === 0) {
            return badRequestResponse(res, 'Councils array is required');
        }

        // Check for existing councils
        const councilNames = councils.map(c => c.name);
        const existingCouncils = await Council.findAll({
            where: {
                name: councilNames
            }
        });

        if (existingCouncils.length > 0) {
            const existingNames = existingCouncils.map(c => c.name);
            return badRequestResponse(
                res, 
                'Some councils already exist',
                { existingCouncils: existingNames }
            );
        }

        // Create all councils
        const createdCouncils = await Council.bulkCreate(councils);

        return createdResponse(res, createdCouncils, `Successfully added ${createdCouncils.length} councils`);
    } catch (error) {
        return errorResponse(res, error.message);
    }
}

