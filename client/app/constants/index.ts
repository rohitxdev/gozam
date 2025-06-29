const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const API_ROUTES = {
	audio: {
		save: `${API_BASE_URL}/audio/save`,
		search: `${API_BASE_URL}/audio/search`,
		list: `${API_BASE_URL}/audio/list`,
	},
};
